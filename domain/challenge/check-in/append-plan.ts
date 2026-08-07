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
 * already-known state — no IO. Same `operationId` + same declared fact is
 * always safely repeatable (`idempotent_replay`), even after the reporting
 * deadline — a resubmitted retry of something already accepted must not
 * start failing just because time has passed. Same `operationId` with a
 * different fact is rejected outright rather than silently producing a
 * different result.
 *
 * `period.reportingClosesAt` (not `period.endsAt` — see periods.ts) is the
 * single deadline for BOTH a genuinely new first report and a correction:
 * previously only corrections were deadline-checked, which meant a first
 * declaration could arrive arbitrarily late while an immediate correction
 * of it could not — an inconsistency this fixes by gating both the same
 * way.
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
  context: { readonly now: IsoDateTime; readonly period: ChallengePeriod },
): CheckInAppendPlan {
  const sameOperation = existingEventsForPeriod.find((event) => event.operationId === request.operationId);
  if (sameOperation) {
    return requestMatchesEvent(request, sameOperation)
      ? { kind: 'idempotent_replay', existingEventId: sameOperation.id }
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
  const sameEventType = event.eventType === (request.isCorrection ? 'correction' : request.fact.kind);
  const sameCorrectionTarget = event.eventType === 'correction'
    ? request.isCorrection && event.correctionOfEventId === request.correctionOfEventId
    : !request.isCorrection;
  return sameEventType && sameCorrectionTarget && factsEqual(event.fact, request.fact);
}
