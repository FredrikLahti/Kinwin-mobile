import { ChallengeId, ChallengePeriodId, CheckInId, IsoDateTime, UserId } from '../types';
import { compareIso } from './iso-time';
import { reduceEffectiveFact } from './reduction';
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
  | 'period_closed_for_correction';

export type CheckInAppendPlan =
  | { readonly kind: 'insert'; readonly eventType: CheckInEventType }
  | { readonly kind: 'idempotent_replay'; readonly existingEventId: CheckInId }
  | { readonly kind: 'rejected'; readonly reason: CheckInAppendRejectionReason };

/**
 * The idempotency + correction-cutoff contract, as a pure function over
 * already-known state — no IO. Same `operationId` + same declared fact is
 * always safely repeatable (`idempotent_replay`); same `operationId` with a
 * different fact is rejected outright rather than silently producing a
 * different result. A genuine correction is only ever accepted while the
 * period is still open (see docs/CHECK_IN_ENGINE.md's correction semantics)
 * and must explicitly target the currently-effective entry — a stale
 * client trying to correct an already-superseded event is rejected, not
 * silently reordered.
 */
export function planCheckInAppend(
  request: CheckInAppendRequest,
  existingEventsForPeriod: readonly CheckInEvent[],
  context: { readonly now: IsoDateTime; readonly periodEndsAt: IsoDateTime },
): CheckInAppendPlan {
  const sameOperation = existingEventsForPeriod.find((event) => event.operationId === request.operationId);
  if (sameOperation) {
    return requestMatchesEvent(request, sameOperation)
      ? { kind: 'idempotent_replay', existingEventId: sameOperation.id }
      : { kind: 'rejected', reason: 'operation_id_conflict' };
  }

  const reduction = reduceEffectiveFact(request.periodId, existingEventsForPeriod);
  if (!reduction.ok) return { kind: 'rejected', reason: 'malformed_existing_history' };
  const current = reduction.effective;

  if (!request.isCorrection) {
    if (current !== null) return { kind: 'rejected', reason: 'unflagged_redeclaration' };
    return { kind: 'insert', eventType: request.fact.kind };
  }

  if (current === null) return { kind: 'rejected', reason: 'correction_without_prior_entry' };
  if (request.correctionOfEventId !== current.winningEventId) return { kind: 'rejected', reason: 'correction_target_mismatch' };
  if (compareIso(context.now, context.periodEndsAt) >= 0) return { kind: 'rejected', reason: 'period_closed_for_correction' };
  return { kind: 'insert', eventType: 'correction' };
}

function requestMatchesEvent(request: CheckInAppendRequest, event: CheckInEvent): boolean {
  const sameEventType = event.eventType === (request.isCorrection ? 'correction' : request.fact.kind);
  const sameCorrectionTarget = event.eventType === 'correction'
    ? request.isCorrection && event.correctionOfEventId === request.correctionOfEventId
    : !request.isCorrection;
  return sameEventType && sameCorrectionTarget && factsEqual(event.fact, request.fact);
}
