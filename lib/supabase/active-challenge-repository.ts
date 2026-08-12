import { ChallengePeriod } from '@/domain/challenge/periods';
import { CheckInEvent, CheckInFact, ClientOperationId } from '@/domain/challenge/check-in/types';
import {
  ActivatedChallengeSnapshot,
  ChallengeDraftId,
  ChallengeId,
  ChallengePeriodId,
  ConsequenceId,
  UserId,
} from '@/domain/challenge/types';

import { supabase } from './client';

function classifyError(error: { message: string }): { readonly kind: 'network' | 'unknown'; readonly message: string } {
  const isNetworkError = error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch');
  return isNetworkError
    ? { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' }
    : { kind: 'unknown', message: 'Something went wrong. Try again.' };
}

export type ActivateChallengeResult =
  | { readonly ok: true; readonly challengeId: string; readonly status: string }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Calls the trusted `activate_challenge_draft` RPC (see
 * supabase/migrations/20260811000000_full_activation.sql). The server —
 * never this client — re-verifies a real, webhook-authorized payment method
 * before it will move the challenge to `active`; passing a timezone here
 * does not bypass that gate, it only supplies the one piece of information
 * that has to come from the device (there is no earlier point in the flow
 * that collects it). Calling this again for an already-active challenge
 * returns the same result instead of erroring.
 */
export async function activateChallenge(
  challengeId: string,
  timezone: string,
): Promise<ActivateChallengeResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!challengeId) return { ok: false, kind: 'not_authenticated' };

  const { data, error } = await supabase.rpc('activate_challenge_draft', {
    challenge_id: challengeId,
    activation_timezone: timezone,
  });
  if (error) return { ok: false, ...classifyError(error) };

  const result = data as { challengeId?: string; status?: string } | null;
  if (!result?.challengeId || !result.status) {
    return { ok: false, kind: 'unknown', message: 'The server did not confirm activation.' };
  }
  return { ok: true, challengeId: result.challengeId, status: result.status };
}

export type ActiveChallengeData = {
  readonly challenge: ActivatedChallengeSnapshot;
  readonly periods: readonly ChallengePeriod[];
  readonly events: readonly CheckInEvent[];
};

export type FetchActiveChallengeResult =
  | { readonly ok: true; readonly data: ActiveChallengeData | null }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Reads the current user's active challenge, if any, plus its generated
 * periods and check-in history, and reconstructs the real domain
 * `ActivatedChallengeSnapshot`/`ChallengePeriod`/`CheckInEvent` shapes those
 * pure functions (`lib/challenge-ux-preview/view-model.ts`'s
 * `buildActiveChallengeViewModel`, the same one already used by the
 * check-in UX review tool) expect — no separate "real" view model exists;
 * this is the one authoritative adapter. `activation_snapshot` stores only
 * what `20260803000000_initial_kinwin_schema.sql`'s CHECK constraint
 * requires (goal/behavior/duration/successRule/recipients/etc.) — fields
 * that live on the row instead (draftId, consequenceId, activatedAt,
 * timezone, startsAt, plannedEndsAt, status) are merged in here, and each
 * recipient's `invitationId` is filled in as `null` since invitations are
 * not built yet (see docs/BACKEND_IMPLEMENTATION_PLAN.md phase 10).
 */
export async function fetchActiveChallenge(userId: string): Promise<FetchActiveChallengeResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data: challengeRow, error: challengeError } = await supabase
    .from('challenges')
    .select('id, source_draft_id, schema_version, activated_at, timezone, starts_at, planned_ends_at, activation_snapshot, challenge_status')
    .eq('owner_id', userId)
    .in('challenge_status', ['active', 'awaiting_resolution'])
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (challengeError) return { ok: false, ...classifyError(challengeError) };
  if (!challengeRow || !challengeRow.activation_snapshot) return { ok: true, data: null };

  const [consequenceResult, recipientsResult, periodsResult, eventsResult] = await Promise.all([
    supabase.from('consequences').select('id').eq('challenge_id', challengeRow.id).maybeSingle(),
    supabase.from('challenge_recipients').select('id, display_name, sort_order').eq('challenge_id', challengeRow.id).order('sort_order'),
    supabase.from('challenge_periods').select('*').eq('challenge_id', challengeRow.id).order('period_number', { ascending: true }),
    supabase.from('check_in_events').select('*').eq('challenge_id', challengeRow.id),
  ]);
  if (consequenceResult.error) return { ok: false, ...classifyError(consequenceResult.error) };
  if (recipientsResult.error) return { ok: false, ...classifyError(recipientsResult.error) };
  if (periodsResult.error) return { ok: false, ...classifyError(periodsResult.error) };
  if (eventsResult.error) return { ok: false, ...classifyError(eventsResult.error) };
  if (!consequenceResult.data) {
    return { ok: false, kind: 'unknown', message: 'The active challenge is missing its consequence record.' };
  }

  const snapshotJson = challengeRow.activation_snapshot as Record<string, unknown>;
  const recipients = (recipientsResult.data ?? []).map((recipient) => ({ id: recipient.id, name: recipient.display_name, invitationId: null }));

  const challenge = {
    ...snapshotJson,
    recipients,
    draftId: challengeRow.source_draft_id as ChallengeDraftId,
    consequenceId: consequenceResult.data.id as ConsequenceId,
    activatedAt: challengeRow.activated_at,
    timezone: challengeRow.timezone,
    startsAt: challengeRow.starts_at,
    plannedEndsAt: challengeRow.planned_ends_at,
    status: challengeRow.challenge_status,
  } as unknown as ActivatedChallengeSnapshot;

  const periods: readonly ChallengePeriod[] = (periodsResult.data ?? []).map((row) => ({
    schemaVersion: 1,
    id: row.id as ChallengePeriodId,
    challengeId: row.challenge_id as ChallengeId,
    periodNumber: row.period_number,
    periodKind: row.period_kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reportingClosesAt: row.reporting_closes_at,
    target: row.target_payload,
  }));

  const events: readonly CheckInEvent[] = (eventsResult.data ?? []).map((row) => {
    const base = {
      schemaVersion: 1 as const,
      id: row.id,
      challengeId: row.challenge_id as ChallengeId,
      ownerId: row.owner_id as UserId,
      periodId: row.period_id as ChallengePeriodId,
      source: row.source,
      clientRecordedAt: row.client_recorded_at,
      serverRecordedAt: row.server_recorded_at,
      operationId: row.idempotency_key,
    };
    return row.event_type === 'correction'
      ? { ...base, eventType: 'correction' as const, correctionOfEventId: row.correction_of_event_id, fact: row.event_payload }
      : { ...base, eventType: row.event_type, fact: row.event_payload };
  });

  return { ok: true, data: { challenge, periods, events } };
}

export type FinalizeChallengeResult =
  | { readonly ok: true; readonly status: 'completed_success' | 'completed_failure'; readonly changed: boolean }
  | { readonly ok: true; readonly status: 'pending' }
  | { readonly ok: false; readonly kind: 'not_configured' | 'network' | 'unknown'; readonly message?: string };

/**
 * Calls the trusted `finalize-challenge` Edge Function (see
 * supabase/functions/finalize-challenge/index.ts), which re-derives
 * success/failure server-side from real persisted state and never trusts
 * the client's own belief that a challenge is done. Meant to be called
 * opportunistically — a trigger, not a source of truth — right after this
 * client's own local view model first observes `finalResult !== null`;
 * safe to call again on an already-finalized challenge, which just
 * returns `changed: false`.
 */
export async function finalizeChallenge(challengeId: string): Promise<FinalizeChallengeResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };

  const { data, error } = await supabase.functions.invoke('finalize-challenge', { body: { challengeId } });
  if (error) return { ok: false, ...classifyError(error) };

  const result = data as { status?: string; evaluable?: boolean; alreadyFinalized?: boolean } | null;
  if (!result?.status) return { ok: false, kind: 'unknown', message: 'The server did not confirm finalization.' };
  if (result.status === 'pending') return { ok: true, status: 'pending' };
  if (result.status === 'completed_success' || result.status === 'completed_failure') {
    return { ok: true, status: result.status, changed: result.alreadyFinalized !== true };
  }
  return { ok: false, kind: 'unknown', message: 'Unexpected finalize-challenge response.' };
}

export type SubmitCheckInResult =
  | { readonly ok: true; readonly status: 'inserted' | 'idempotent_replay'; readonly eventId: string }
  | { readonly ok: false; readonly kind: 'rejected'; readonly reason: string }
  | { readonly ok: false; readonly kind: 'not_configured' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Calls the trusted `append-check-in-event` Edge Function (see
 * supabase/functions/append-check-in-event/index.ts), which runs the real
 * `planCheckInAppend` domain contract server-side before writing anything.
 * `operationId` must be minted once per logical user action and resubmitted
 * verbatim on retry — never regenerated — so a duplicate tap or a network
 * retry replays safely instead of double-recording.
 */
export async function submitCheckIn(input: {
  readonly challengeId: string;
  readonly periodId: string;
  readonly operationId: ClientOperationId;
  readonly fact: CheckInFact;
  readonly isCorrection: boolean;
  readonly correctionOfEventId?: string;
  readonly clientRecordedAt: string;
}): Promise<SubmitCheckInResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };

  const { data, error } = await supabase.functions.invoke('append-check-in-event', {
    body: {
      challengeId: input.challengeId,
      periodId: input.periodId,
      operationId: input.operationId,
      fact: input.fact,
      isCorrection: input.isCorrection,
      correctionOfEventId: input.correctionOfEventId,
      source: 'ios',
      clientRecordedAt: input.clientRecordedAt,
    },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        if (body?.status === 'rejected' && typeof body.reason === 'string') {
          return { ok: false, kind: 'rejected', reason: body.reason };
        }
      } catch {
        // fall through to the generic network/unknown classification below
      }
    }
    return { ok: false, ...classifyError(error) };
  }

  const result = data as { status?: string; eventId?: string } | null;
  if (!result?.eventId || (result.status !== 'inserted' && result.status !== 'idempotent_replay')) {
    return { ok: false, kind: 'unknown', message: 'The server did not confirm the check-in.' };
  }
  return { ok: true, status: result.status, eventId: result.eventId };
}
