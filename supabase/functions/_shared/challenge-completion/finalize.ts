import { evaluateChallenge, ChallengeEvaluationInput } from '../check-in-engine/results.ts';
import { ChallengePeriod } from '../check-in-engine/periods.ts';
import { CheckInEvent } from '../check-in-engine/check-in/types.ts';
import { ActivatedChallengeSnapshot } from '../check-in-engine/types.ts';

// Deliberately structural: both @supabase/server's admin client and a
// service-role supabase-js client implement this surface.
// deno-lint-ignore no-explicit-any
export type CompletionAdminClient = any;

export type FinalizePersistedChallengeResult =
  | { readonly kind: 'terminal'; readonly status: 'completed_success' | 'completed_failure'; readonly changed: boolean }
  | { readonly kind: 'pending'; readonly reasons: readonly string[] };

export class ChallengeCompletionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ChallengeCompletionError';
  }
}

// deno-lint-ignore no-explicit-any
function toChallengePeriod(row: any): ChallengePeriod {
  return {
    schemaVersion: 1,
    id: row.id,
    challengeId: row.challenge_id,
    periodNumber: row.period_number,
    periodKind: row.period_kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reportingClosesAt: row.reporting_closes_at,
    target: row.target_payload,
  };
}

// deno-lint-ignore no-explicit-any
function toCheckInEvent(row: any): CheckInEvent {
  const base = {
    schemaVersion: 1 as const,
    id: row.id,
    challengeId: row.challenge_id,
    ownerId: row.owner_id,
    periodId: row.period_id,
    source: row.source,
    clientRecordedAt: row.client_recorded_at,
    serverRecordedAt: row.server_recorded_at,
    operationId: row.idempotency_key,
  };
  if (row.event_type === 'correction') {
    return { ...base, eventType: 'correction', correctionOfEventId: row.correction_of_event_id, fact: row.event_payload };
  }
  return { ...base, eventType: row.event_type, fact: row.event_payload };
}

/**
 * One authoritative finalization path for both the authenticated fast-path
 * and the scheduled service worker. It re-derives the result exclusively
 * from persisted server state, then delegates the terminal write and
 * social-event insert to finalize_challenge_result's row-locked transaction.
 * It never mutates a consequence or invokes a payment/reward provider.
 */
export async function finalizePersistedChallenge(
  admin: CompletionAdminClient,
  challengeId: string,
  expectedOwnerId?: string,
): Promise<FinalizePersistedChallengeResult> {
  let challengeQuery = admin
    .from('challenges')
    .select('id, owner_id, source_draft_id, schema_version, rule_engine_version, activated_at, timezone, starts_at, planned_ends_at, activation_snapshot, challenge_status')
    .eq('id', challengeId);
  if (expectedOwnerId) challengeQuery = challengeQuery.eq('owner_id', expectedOwnerId);

  const { data: challengeRow, error: challengeError } = await challengeQuery.maybeSingle();
  if (challengeError) throw new ChallengeCompletionError('challenge_read_failed', challengeError.message);
  if (!challengeRow || !challengeRow.activation_snapshot) throw new ChallengeCompletionError('challenge_not_found', 'challenge not found');

  const ownerId = challengeRow.owner_id as string;
  if (challengeRow.challenge_status === 'completed_success' || challengeRow.challenge_status === 'completed_failure') {
    return { kind: 'terminal', status: challengeRow.challenge_status, changed: false };
  }
  if (!['active', 'completion_mode', 'awaiting_resolution'].includes(challengeRow.challenge_status)) {
    throw new ChallengeCompletionError('invalid_state', 'challenge is not in a state that can be finalized');
  }

  let resolvedStatus = challengeRow.challenge_status as string;
  if (resolvedStatus === 'active' || resolvedStatus === 'completion_mode') {
    const { data, error } = await admin.rpc('reconcile_challenge_lifecycle', { p_challenge_id: challengeId });
    if (error) throw new ChallengeCompletionError('reconciliation_failed', error.message);
    resolvedStatus = data as string;
  }
  if (resolvedStatus !== 'awaiting_resolution') {
    return { kind: 'pending', reasons: ['still_in_progress'] };
  }

  const [consequenceResult, periodsResult, eventsResult] = await Promise.all([
    admin.from('consequences').select('id').eq('challenge_id', challengeId).maybeSingle(),
    admin.from('challenge_periods').select('*').eq('challenge_id', challengeId).order('period_number', { ascending: true }),
    admin.from('check_in_events').select('*').eq('challenge_id', challengeId),
  ]);
  if (consequenceResult.error) throw new ChallengeCompletionError('consequence_read_failed', consequenceResult.error.message);
  if (periodsResult.error) throw new ChallengeCompletionError('periods_read_failed', periodsResult.error.message);
  if (eventsResult.error) throw new ChallengeCompletionError('events_read_failed', eventsResult.error.message);
  if (!consequenceResult.data) throw new ChallengeCompletionError('missing_consequence', 'challenge consequence is missing');

  const snapshotJson = challengeRow.activation_snapshot as Record<string, unknown>;
  const recipients = ((snapshotJson.recipients as readonly { id: string; name: string }[] | undefined) ?? [])
    .map((recipient) => ({ id: recipient.id, name: recipient.name, invitationId: null }));
  const challenge = {
    ...snapshotJson,
    recipients,
    draftId: challengeRow.source_draft_id,
    consequenceId: consequenceResult.data.id,
    activatedAt: challengeRow.activated_at,
    timezone: challengeRow.timezone,
    startsAt: challengeRow.starts_at,
    plannedEndsAt: challengeRow.planned_ends_at,
    status: resolvedStatus,
  } as unknown as ActivatedChallengeSnapshot;
  // deno-lint-ignore no-explicit-any
  const periods = (periodsResult.data ?? []).map((row: any) => toChallengePeriod(row));
  // deno-lint-ignore no-explicit-any
  const events = (eventsResult.data ?? []).map((row: any) => toCheckInEvent(row));
  const evaluatedAt = new Date().toISOString();
  const evaluation = evaluateChallenge({
    challenge,
    periods,
    events,
    evaluatedAt: evaluatedAt as ChallengeEvaluationInput['evaluatedAt'],
  });

  if (!evaluation.evaluable) return { kind: 'pending', reasons: evaluation.reasons };

  const status = evaluation.status === 'success' ? 'completed_success' : 'completed_failure';
  const activityKind = evaluation.status === 'success' ? 'challenge_succeeded' : 'challenge_failed';
  const activityPayload: Record<string, unknown> = {
    behavior: snapshotJson.behavior,
    duration: snapshotJson.duration,
  };
  if (activityKind === 'challenge_failed') {
    activityPayload.recipients = recipients.map((recipient) => ({ name: recipient.name }));
    activityPayload.consequenceCategory = snapshotJson.consequenceCategory;
    activityPayload.stake = snapshotJson.stake;
  }

  const { data: rpcResult, error: rpcError } = await admin.rpc('finalize_challenge_result', {
    p_owner_id: ownerId,
    p_challenge_id: challengeId,
    p_status: status,
    p_activity_kind: activityKind,
    p_activity_payload: activityPayload,
    p_dedupe_key: `${activityKind}:${challengeId}`,
  });
  if (rpcError) throw new ChallengeCompletionError(`finalize_rpc_${rpcError.code ?? 'failed'}`, rpcError.message);

  const result = rpcResult as { status?: string; alreadyFinalized?: boolean } | null;
  const persistedStatus = result?.status;
  if (persistedStatus !== 'completed_success' && persistedStatus !== 'completed_failure') {
    throw new ChallengeCompletionError('unexpected_finalize_result', 'terminal RPC returned an unexpected status');
  }
  return { kind: 'terminal', status: persistedStatus, changed: result?.alreadyFinalized !== true };
}
