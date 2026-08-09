// Authenticated Edge Function: the trusted check-in write endpoint
// (docs/BACKEND_IMPLEMENTATION_PLAN.md phase 5). Never writes anything
// without a verified Supabase user JWT establishing the caller first (never
// from the request body).
//
// The actual idempotency/correction/reporting-deadline DECISION is made by
// `planCheckInAppend` — the real, tested domain contract
// (domain/challenge/check-in/append-plan.ts), reused here verbatim via the
// byte-identical copy at ../_shared/check-in-engine/ (see that directory's
// file headers for why a copy exists at all: Deno requires explicit `.ts`
// extensions on relative imports that the RN/tsc side does not use). This
// file's own job is thin: verify the caller, load exactly the state the
// pure contract needs, call it, and only if it says 'insert' hand the
// already-decided event to the trusted `public.append_check_in_event` RPC
// (supabase/migrations/20260812000000_check_in_append.sql) for the actual
// atomic write and its own defense-in-depth re-validation.
import { withSupabase } from 'npm:@supabase/server@^1';

import { planCheckInAppend, CheckInAppendRequest } from '../_shared/check-in-engine/check-in/append-plan.ts';
import { ChallengePeriod } from '../_shared/check-in-engine/periods.ts';
import { CheckInEvent, CheckInFact } from '../_shared/check-in-engine/check-in/types.ts';

type RequestBody = {
  readonly challengeId?: unknown;
  readonly periodId?: unknown;
  readonly operationId?: unknown;
  readonly fact?: unknown;
  readonly isCorrection?: unknown;
  readonly correctionOfEventId?: unknown;
  readonly source?: unknown;
  readonly clientRecordedAt?: unknown;
};

function jsonError(status: number, error: string, message?: string): Response {
  return Response.json({ error, ...(message ? { message } : {}) }, { status });
}

const FACT_KINDS = ['build_completion', 'cut_back_total', 'stop_intact', 'stop_lapse'] as const;
const SOURCES = ['ios', 'android', 'web'] as const;

function isValidFact(value: unknown): value is CheckInFact {
  if (typeof value !== 'object' || value === null) return false;
  const fact = value as Record<string, unknown>;
  if (!FACT_KINDS.includes(fact.kind as (typeof FACT_KINDS)[number])) return false;
  if (fact.kind === 'build_completion') return typeof fact.completions === 'number' && fact.completions >= 0;
  if (fact.kind === 'cut_back_total') {
    return typeof fact.total === 'number' && fact.total >= 0 && typeof fact.unit === 'string' && fact.unit.length > 0;
  }
  return fact.kind === 'stop_intact' || fact.kind === 'stop_lapse';
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

/** Maps a trusted RPC's own rejection to this endpoint's response — never a raw internal error to the caller. */
function rpcErrorResponse(error: { readonly code?: string; readonly message?: string }): Response {
  switch (error.code) {
    case 'P0002':
      return jsonError(404, 'not_found', 'challenge or period not found');
    case '22023':
      return jsonError(400, 'invalid_state', error.message);
    case '28000':
      return jsonError(401, 'unauthorized');
    default:
      console.error('append-check-in-event: unexpected RPC error', error.code);
      return jsonError(500, 'internal_error');
  }
}

export default {
  // See create-consequence-setup-intent/index.ts for why the `any` Database
  // generic is deliberate here too — no generated Supabase Database type
  // exists in this backend.
  fetch: withSupabase<any>({ auth: 'user' }, async (req, ctx) => {
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'invalid_request', 'expected a JSON body');
    }

    const challengeId = typeof body.challengeId === 'string' && body.challengeId.length > 0 ? body.challengeId : null;
    const periodId = typeof body.periodId === 'string' && body.periodId.length > 0 ? body.periodId : null;
    const operationId = typeof body.operationId === 'string' && body.operationId.length > 0 ? body.operationId : null;
    const isCorrection = body.isCorrection === true;
    const correctionOfEventId = typeof body.correctionOfEventId === 'string' && body.correctionOfEventId.length > 0
      ? body.correctionOfEventId : null;
    const source = typeof body.source === 'string' && (SOURCES as readonly string[]).includes(body.source) ? body.source : null;
    const clientRecordedAt = typeof body.clientRecordedAt === 'string' && body.clientRecordedAt.length > 0
      ? body.clientRecordedAt : null;

    if (!challengeId || !periodId || !operationId || !source || !clientRecordedAt) {
      return jsonError(400, 'invalid_request', 'challengeId, periodId, operationId, source, and clientRecordedAt are required');
    }
    if (!isValidFact(body.fact)) {
      return jsonError(400, 'invalid_request', 'fact is missing or malformed');
    }
    if (isCorrection && !correctionOfEventId) {
      return jsonError(400, 'invalid_request', 'a correction requires correctionOfEventId');
    }
    const fact = body.fact as CheckInFact;

    // The caller is derived from the verified JWT `withSupabase` already
    // checked — never from the request body, which carries no identity at all.
    const ownerId = ctx.userClaims?.id;
    if (!ownerId) {
      return jsonError(401, 'unauthorized');
    }

    const { data: challenge, error: challengeError } = await ctx.supabaseAdmin
      .from('challenges')
      .select('id, challenge_status')
      .eq('id', challengeId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (challengeError) {
      console.error('append-check-in-event: failed to load challenge', challengeError.message);
      return jsonError(500, 'internal_error');
    }
    if (!challenge) return jsonError(404, 'not_found', 'challenge not found');
    if (challenge.challenge_status !== 'active') return jsonError(400, 'invalid_state', 'challenge must be active to check in');

    const { data: periodRow, error: periodError } = await ctx.supabaseAdmin
      .from('challenge_periods')
      .select('*')
      .eq('id', periodId)
      .eq('challenge_id', challengeId)
      .maybeSingle();
    if (periodError) {
      console.error('append-check-in-event: failed to load period', periodError.message);
      return jsonError(500, 'internal_error');
    }
    if (!periodRow) return jsonError(404, 'not_found', 'period not found for this challenge');
    const period = toChallengePeriod(periodRow);

    // Two reads, deliberately separate — see append-plan.ts's own header
    // comment on why the operation-id lookup must be challenge-wide, not
    // period-local: `idempotency_key` is unique per challenge, not per
    // period, so an id reused across two different periods would never be
    // caught by a period-scoped search.
    const [periodEventsResult, operationEventResult] = await Promise.all([
      ctx.supabaseAdmin.from('check_in_events').select('*').eq('period_id', periodId),
      ctx.supabaseAdmin.from('check_in_events').select('*').eq('challenge_id', challengeId).eq('idempotency_key', operationId).maybeSingle(),
    ]);
    if (periodEventsResult.error) {
      console.error('append-check-in-event: failed to load period history', periodEventsResult.error.message);
      return jsonError(500, 'internal_error');
    }
    if (operationEventResult.error) {
      console.error('append-check-in-event: failed to look up operation id', operationEventResult.error.message);
      return jsonError(500, 'internal_error');
    }

    // deno-lint-ignore no-explicit-any
    const existingEventsForPeriod: readonly CheckInEvent[] = (periodEventsResult.data ?? []).map((row: any) => toCheckInEvent(row));
    const existingEventForOperationId: CheckInEvent | null = operationEventResult.data ? toCheckInEvent(operationEventResult.data) : null;

    const request: CheckInAppendRequest = {
      operationId: operationId as CheckInAppendRequest['operationId'],
      challengeId: challengeId as CheckInAppendRequest['challengeId'],
      ownerId: ownerId as CheckInAppendRequest['ownerId'],
      periodId: periodId as CheckInAppendRequest['periodId'],
      fact,
      isCorrection,
      correctionOfEventId: (correctionOfEventId ?? undefined) as CheckInAppendRequest['correctionOfEventId'],
      source: source as CheckInAppendRequest['source'],
      clientRecordedAt: clientRecordedAt as CheckInAppendRequest['clientRecordedAt'],
    };

    const plan = planCheckInAppend(request, existingEventsForPeriod, existingEventForOperationId, {
      now: new Date().toISOString() as CheckInAppendRequest['clientRecordedAt'],
      period,
    });

    if (plan.kind === 'rejected') {
      return Response.json({ status: 'rejected', reason: plan.reason }, { status: 409 });
    }

    if (plan.kind === 'idempotent_replay') {
      const existing = existingEventsForPeriod.find((event) => event.id === plan.existingEventId) ?? existingEventForOperationId;
      return Response.json({
        status: 'idempotent_replay',
        eventId: plan.existingEventId,
        serverRecordedAt: existing?.serverRecordedAt ?? null,
      });
    }

    const { data: insertResult, error: insertError } = await ctx.supabaseAdmin.rpc('append_check_in_event', {
      p_owner_id: ownerId,
      p_challenge_id: challengeId,
      p_period_id: periodId,
      p_event_type: plan.eventType,
      p_event_payload: fact,
      p_source: source,
      p_client_recorded_at: clientRecordedAt,
      p_idempotency_key: operationId,
      p_correction_of_event_id: isCorrection ? correctionOfEventId : null,
    });
    if (insertError) {
      return rpcErrorResponse(insertError);
    }

    const result = insertResult as { eventId?: string; serverRecordedAt?: string; idempotentReplay?: boolean } | null;
    if (!result?.eventId) {
      console.error('append-check-in-event: RPC did not return an event id');
      return jsonError(500, 'internal_error');
    }
    return Response.json({
      status: result.idempotentReplay ? 'idempotent_replay' : 'inserted',
      eventId: result.eventId,
      serverRecordedAt: result.serverRecordedAt ?? null,
    });
  }),
};
