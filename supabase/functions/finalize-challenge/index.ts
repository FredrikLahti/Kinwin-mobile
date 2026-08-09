// Authenticated Edge Function: the trusted challenge-finalization endpoint.
// Nothing persists evaluateChallenge's success/failure verdict back to
// challenge_status anywhere else — Home only ever detected completion
// client-side (a known, previously-flagged gap). This function closes it,
// and is what makes "failure is a first-class social event" true: it is
// the only place challenge_succeeded/challenge_failed activity is ever
// generated, and it always re-derives the verdict itself from real
// persisted state, never from the caller's own claim.
//
// Opportunistic, not scheduled: the client calls this when its own local
// view model (lib/challenge-ux-preview/view-model.ts's finalResult) first
// observes a challenge looks done, purely as a trigger to ask the server
// to check for real. The server re-runs the actual, tested evaluator
// (domain/challenge/results.ts's evaluateChallenge, reused verbatim here
// via the byte-identical copy at ../_shared/check-in-engine/results.ts —
// see that directory's file headers for why a copy exists at all) against
// freshly loaded periods/events, exactly as fetchActiveChallenge
// (lib/supabase/active-challenge-repository.ts) reconstructs them for the
// client, and never trusts anything the request body says about the
// result. The actual write — status transition plus the idempotent
// activity insert — is delegated to the trusted
// public.finalize_challenge_result RPC
// (supabase/migrations/20260816000000_finalize_challenge_result.sql), same
// division of labor as append-check-in-event/append_check_in_event.
import { withSupabase } from 'npm:@supabase/server@^1';

import { evaluateChallenge, ChallengeEvaluationInput } from '../_shared/check-in-engine/results.ts';
import { ChallengePeriod } from '../_shared/check-in-engine/periods.ts';
import { CheckInEvent } from '../_shared/check-in-engine/check-in/types.ts';
import { ActivatedChallengeSnapshot } from '../_shared/check-in-engine/types.ts';

type RequestBody = {
  readonly challengeId?: unknown;
};

function jsonError(status: number, error: string, message?: string): Response {
  return Response.json({ error, ...(message ? { message } : {}) }, { status });
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

function rpcErrorResponse(error: { readonly code?: string; readonly message?: string }): Response {
  switch (error.code) {
    case 'P0002':
      return jsonError(404, 'not_found', 'challenge not found');
    case '22023':
      return jsonError(400, 'invalid_state', error.message);
    case '28000':
      return jsonError(401, 'unauthorized');
    default:
      console.error('finalize-challenge: unexpected RPC error', error.code);
      return jsonError(500, 'internal_error');
  }
}

export default {
  fetch: withSupabase<any>({ auth: 'user' }, async (req, ctx) => {
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'invalid_request', 'expected a JSON body');
    }

    const challengeId = typeof body.challengeId === 'string' && body.challengeId.length > 0 ? body.challengeId : null;
    if (!challengeId) return jsonError(400, 'invalid_request', 'challengeId is required');

    const ownerId = ctx.userClaims?.id;
    if (!ownerId) return jsonError(401, 'unauthorized');

    const { data: challengeRow, error: challengeError } = await ctx.supabaseAdmin
      .from('challenges')
      .select('id, source_draft_id, schema_version, rule_engine_version, activated_at, timezone, starts_at, planned_ends_at, activation_snapshot, challenge_status')
      .eq('id', challengeId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (challengeError) {
      console.error('finalize-challenge: failed to load challenge', challengeError.message);
      return jsonError(500, 'internal_error');
    }
    if (!challengeRow || !challengeRow.activation_snapshot) return jsonError(404, 'not_found', 'challenge not found');

    if (challengeRow.challenge_status === 'completed_success' || challengeRow.challenge_status === 'completed_failure') {
      return Response.json({ status: challengeRow.challenge_status, evaluable: true, alreadyFinalized: true });
    }
    if (challengeRow.challenge_status !== 'active') {
      return jsonError(400, 'invalid_state', 'challenge must be active to finalize');
    }

    const [consequenceResult, periodsResult, eventsResult] = await Promise.all([
      ctx.supabaseAdmin.from('consequences').select('id').eq('challenge_id', challengeId).maybeSingle(),
      ctx.supabaseAdmin.from('challenge_periods').select('*').eq('challenge_id', challengeId).order('period_number', { ascending: true }),
      ctx.supabaseAdmin.from('check_in_events').select('*').eq('challenge_id', challengeId),
    ]);
    if (consequenceResult.error) {
      console.error('finalize-challenge: failed to load consequence', consequenceResult.error.message);
      return jsonError(500, 'internal_error');
    }
    if (periodsResult.error) {
      console.error('finalize-challenge: failed to load periods', periodsResult.error.message);
      return jsonError(500, 'internal_error');
    }
    if (eventsResult.error) {
      console.error('finalize-challenge: failed to load check-in history', eventsResult.error.message);
      return jsonError(500, 'internal_error');
    }
    if (!consequenceResult.data) {
      return jsonError(500, 'internal_error', 'the active challenge is missing its consequence record');
    }

    const snapshotJson = challengeRow.activation_snapshot as Record<string, unknown>;
    const recipients = (snapshotJson.recipients as readonly { id: string; name: string }[] | undefined ?? []).map(
      (recipient) => ({ id: recipient.id, name: recipient.name, invitationId: null }),
    );
    const challenge = {
      ...snapshotJson,
      recipients,
      draftId: challengeRow.source_draft_id,
      consequenceId: consequenceResult.data.id,
      activatedAt: challengeRow.activated_at,
      timezone: challengeRow.timezone,
      startsAt: challengeRow.starts_at,
      plannedEndsAt: challengeRow.planned_ends_at,
      status: challengeRow.challenge_status,
    } as unknown as ActivatedChallengeSnapshot;

    // deno-lint-ignore no-explicit-any
    const periods: readonly ChallengePeriod[] = (periodsResult.data ?? []).map((row: any) => toChallengePeriod(row));
    // deno-lint-ignore no-explicit-any
    const events: readonly CheckInEvent[] = (eventsResult.data ?? []).map((row: any) => toCheckInEvent(row));

    const evaluatedAt = new Date().toISOString();
    const input: ChallengeEvaluationInput = {
      challenge,
      periods,
      events,
      evaluatedAt: evaluatedAt as ChallengeEvaluationInput['evaluatedAt'],
    };
    const evaluation = evaluateChallenge(input);

    if (!evaluation.evaluable) {
      return Response.json({ status: 'pending', evaluable: false, reasons: evaluation.reasons });
    }

    const status = evaluation.status === 'success' ? 'completed_success' : 'completed_failure';
    const activityKind = evaluation.status === 'success' ? 'challenge_succeeded' : 'challenge_failed';
    const dedupeKey = `${activityKind}:${challengeId}`;

    // Success and failure both carry the behavior/duration facts needed to
    // render the activity card without any client-side lookup of the
    // (private) challenge row. Failure additionally carries the safe,
    // product-approved consequence facts — recipient display names, the
    // experience category, and the stake amount — matching the task's own
    // example ("Mom and Dad get a wellness experience worth $200"). Never
    // recipient contact details, payment identifiers, or authorization
    // state; the snapshot never contained those in the first place.
    const activityPayload: Record<string, unknown> = {
      behavior: snapshotJson.behavior,
      duration: snapshotJson.duration,
    };
    if (activityKind === 'challenge_failed') {
      activityPayload.recipients = recipients.map((r) => ({ name: r.name }));
      activityPayload.consequenceCategory = snapshotJson.consequenceCategory;
      activityPayload.stake = snapshotJson.stake;
    }

    const { data: rpcResult, error: rpcError } = await ctx.supabaseAdmin.rpc('finalize_challenge_result', {
      p_owner_id: ownerId,
      p_challenge_id: challengeId,
      p_status: status,
      p_activity_kind: activityKind,
      p_activity_payload: activityPayload,
      p_dedupe_key: dedupeKey,
    });
    if (rpcError) return rpcErrorResponse(rpcError);

    const result = rpcResult as { status?: string; alreadyFinalized?: boolean } | null;
    return Response.json({ status: result?.status ?? status, evaluable: true, alreadyFinalized: result?.alreadyFinalized ?? false });
  }),
};
