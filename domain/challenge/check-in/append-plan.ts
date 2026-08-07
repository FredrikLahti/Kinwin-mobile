import { ChallengePeriod } from '../periods';
import { ChallengeId, ChallengePeriodId, CheckInId, IsoDateTime, UserId } from '../types';
import { compareIso } from './iso-time';
import { reduceEffectiveFact } from './reduction';
import { resolveStopHistory } from './stop-reduction';
import { CheckInEvent, CheckInEventType, CheckInFact, CheckInSource, ClientOperationId, factsEqual } from './types';

/**
 * What a client wants recorded, before the trusted write endpoint (not
 * built in this package — see docs/CHECK_IN_ENGINE.md) turns it into a row.
 * Mirrors `lib/supabase/draft-mutation.ts`'s "decide the operation
 * client-independent-of-IO, then let the trusted layer execute exactly
 * that" pattern.
 */
export type CheckInAppendRequest = {
  readonly operationId: ClientOperationId;
  readonly challengeId: ChallengeId;
  readonly ownerId: UserId;
  readonly periodId: ChallengePeriodId;
  readonly fact: CheckInFact;
  readonly isCorrection: boolean;
  readonly correctionOfEventId?: CheckInId;
  readonly source: CheckInSource;
  readonly clientRecordedAt: IsoDateTime;
};

export type CheckInAppendRejectionReason =
  | 'operation_id_conflict'
  | 'malformed_existing_history'
  | 'unflagged_redeclaration'
  | 'correction_without_prior_entry'
  | 'correction_target_mismatch'
  | 'reporting_deadline_passed';

export type CheckInAppendPlan =
  | { readonly kind: 'insert'; readonly eventType: CheckInEventType }
  | { readonly kind: 'idempotent_replay'; readonly existingEventId: CheckInId }
  | { readonly kind: 'rejected'; readonly reason: CheckInAppendRejectionReason };

/**
 * The idempotency + reporting-window contract, as a pure function over
 * already-known state — no IO. `check_in_events.idempotency_key` is unique
 * per *challenge*, not per period, so the idempotency check below is
 * intentionally challenge-scoped and separate from `existingEventsForPeriod`
 * (which stays period-local — it is only ever used for reduction/correction
 * semantics, never for finding a reused operation id).
 *
 * The caller is expected to resolve `(challenge_id, idempotency_key)`
 * challenge-wide FIRST — a single lookup against the whole challenge, not a
 * per-period one — and pass whatever it finds (or `null`) as
 * `existingEventForOperationId`; period history is loaded separately, only
 * for the period the request actually targets. A future trusted write
 * endpoint should follow the same two-step shape: resolve the operation id
 * challenge-wide before touching period history at all.
 *
 * "Same logical operation" (→ `idempotent_replay`) requires the existing
 * event to match the request on every part of its persisted semantic
 * identity: period, event type (or `correction`), the declared fact, and —
 * for a correction — its target. Any mismatch on a reused operation id —
 * including the operation id having been used for a *different period* of
 * the same challenge — is a real collision, not a legitimate retry, and is
 * rejected outright (`operation_id_conflict`) rather than silently
 * producing a different result. This must never be treated as a corner
 * case a database unique-constraint exception happens to catch later; it is
 * this pure contract's normal, expected behavior.
 *
 * `period.reportingClosesAt` (not `period.endsAt` — see periods.ts) is the
 * single deadline for BOTH a genuinely new first report and a correction —
 * see the module-level note in docs/CHECK_IN_ENGINE.md's "Reporting window"
 * section.
 *
 * Stop (`period.target.type === 'maximum_lapses'`) is the one direction
 * where a second, ordinary (non-correction) declaration for the same
 * period is expected and valid — repeated `stop_intact` pings are ordinary
 * history, not corrections (see stop-reduction.ts) — so the
 * "already-decided, must be flagged" rule below is scoped to build/cut_back
 * only.
 */
export function planCheckInAppend(
  request: CheckInAppendRequest,
  existingEventsForPeriod: readonly CheckInEvent[],
  existingEventForOperationId: CheckInEvent | null,
  context: { readonly now: IsoDateTime; readonly period: ChallengePeriod },
): CheckInAppendPlan {
  if (existingEventForOperationId) {
    return requestMatchesEvent(request, existingEventForOperationId)
      ? { kind: 'idempotent_replay', existingEventId: existingEventForOperationId.id }
      : { kind: 'rejected', reason: 'operation_id_conflict' };
  }

  const deadlinePassed = compareIso(context.now, context.period.reportingClosesAt) >= 0;
  const isStop = context.period.target.type === 'maximum_lapses';

  if (!request.isCorrection) {
    if (!isStop) {
      const reduction = reduceEffectiveFact(request.periodId, existingEventsForPeriod);
      if (!reduction.ok) return { kind: 'rejected', reason: 'malformed_existing_history' };
      if (reduction.effective !== null) return { kind: 'rejected', reason: 'unflagged_redeclaration' };
    } else {
      const history = resolveStopHistory(context.period, existingEventsForPeriod);
      if (!history.ok) return { kind: 'rejected', reason: 'malformed_existing_history' };
    }
    if (deadlinePassed) return { kind: 'rejected', reason: 'reporting_deadline_passed' };
    return { kind: 'insert', eventType: request.fact.kind };
  }

  if (isStop) {
    const history = resolveStopHistory(context.period, existingEventsForPeriod);
    if (!history.ok) return { kind: 'rejected', reason: 'malformed_existing_history' };
    if (history.validCorrectionTargets.size === 0) return { kind: 'rejected', reason: 'correction_without_prior_entry' };
    if (!request.correctionOfEventId || !history.validCorrectionTargets.has(request.correctionOfEventId)) {
      return { kind: 'rejected', reason: 'correction_target_mismatch' };
    }
    if (deadlinePassed) return { kind: 'rejected', reason: 'reporting_deadline_passed' };
    return { kind: 'insert', eventType: 'correction' };
  }

  const reduction = reduceEffectiveFact(request.periodId, existingEventsForPeriod);
  if (!reduction.ok) return { kind: 'rejected', reason: 'malformed_existing_history' };
  const current = reduction.effective;
  if (current === null) return { kind: 'rejected', reason: 'correction_without_prior_entry' };
  if (request.correctionOfEventId !== current.winningEventId) return { kind: 'rejected', reason: 'correction_target_mismatch' };
  if (deadlinePassed) return { kind: 'rejected', reason: 'reporting_deadline_passed' };
  return { kind: 'insert', eventType: 'correction' };
}

function requestMatchesEvent(request: CheckInAppendRequest, event: CheckInEvent): boolean {
  const sameChallenge = event.challengeId === request.challengeId;
  const samePeriod = event.periodId === request.periodId;
  const sameEventType = event.eventType === (request.isCorrection ? 'correction' : request.fact.kind);
  const sameCorrectionTarget = event.eventType === 'correction'
    ? request.isCorrection && event.correctionOfEventId === request.correctionOfEventId
    : !request.isCorrection;
  return sameChallenge && samePeriod && sameEventType && sameCorrectionTarget && factsEqual(event.fact, request.fact);
}
