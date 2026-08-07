import { ChallengePeriodId, CheckInId } from '../types';
import { CheckInEvent, CheckInFact, factsEqual } from './types';
import { compareIso } from './iso-time';

export type EffectiveFact = { readonly fact: CheckInFact; readonly winningEventId: CheckInId };

export type ReductionResult =
  | { readonly ok: true; readonly effective: EffectiveFact | null }
  | { readonly ok: false; readonly reason: string };

/**
 * Folds one period's append-only event chain into its single current
 * effective fact — "the latest valid user decision for that period" (see
 * docs/CHECK_IN_ENGINE.md). Only server-timestamped events are considered
 * trustworthy input; the caller (period-state.ts / evaluateChallenge) is
 * responsible for deciding whether the presence of untimestamped events
 * should block a *challenge-level* result.
 *
 * Fails safely (`ok: false`) rather than guessing whenever the chain is
 * inconsistent with the append-only/explicit-correction model — this is
 * the domain-level enforcement of "a correction must be explicit," since a
 * plain second original for an already-decided period is exactly the kind
 * of ambiguous history that must never silently produce a result.
 */
export function reduceEffectiveFact(
  periodId: ChallengePeriodId,
  eventsForPeriod: readonly CheckInEvent[],
): ReductionResult {
  const trusted = eventsForPeriod.filter((event) => event.serverRecordedAt !== null);
  if (trusted.some((event) => event.periodId !== periodId)) {
    return { ok: false, reason: 'event does not belong to the period being reduced' };
  }

  const conflict = findOperationIdConflict(trusted);
  if (conflict) return { ok: false, reason: conflict };

  // Two persisted rows sharing an operation id should never happen once a
  // real idempotency-keyed unique index sits in front of storage — but this
  // function must still behave correctly if handed a legitimate retry pair
  // directly (as in a unit test, or before that index exists). Having
  // already proven above that any such pair agrees on everything it
  // declares, only one representative needs to take part in the fold.
  const deduplicated = dedupeByOperationId(trusted);

  const ordered = [...deduplicated].sort((a, b) => {
    const bySever = compareIso(a.serverRecordedAt!, b.serverRecordedAt!);
    return bySever !== 0 ? bySever : a.id.localeCompare(b.id);
  });

  let current: EffectiveFact | null = null;
  for (const event of ordered) {
    if (event.eventType !== 'correction') {
      if (current !== null) {
        return { ok: false, reason: 'a second original entry was recorded for a period that already has an effective fact' };
      }
      current = { fact: event.fact, winningEventId: event.id };
      continue;
    }
    if (current === null) {
      return { ok: false, reason: 'a correction was recorded with no prior entry for this period' };
    }
    if (event.correctionOfEventId !== current.winningEventId) {
      return { ok: false, reason: 'a correction does not target the currently-effective entry for this period' };
    }
    current = { fact: event.fact, winningEventId: event.id };
  }

  return { ok: true, effective: current };
}

/** Two events sharing an operation id must agree on everything they declare — a real collision, not a legitimate retry, otherwise. */
function findOperationIdConflict(events: readonly CheckInEvent[]): string | null {
  const byOperation = new Map<string, CheckInEvent>();
  for (const event of events) {
    if (event.operationId === null) continue;
    const seen = byOperation.get(event.operationId);
    if (!seen) {
      byOperation.set(event.operationId, event);
      continue;
    }
    const sameTarget = seen.eventType === 'correction' && event.eventType === 'correction'
      ? seen.correctionOfEventId === event.correctionOfEventId
      : seen.eventType === event.eventType;
    if (!sameTarget || !factsEqual(seen.fact, event.fact)) {
      return 'conflicting events share the same operation id';
    }
  }
  return null;
}

function dedupeByOperationId(events: readonly CheckInEvent[]): readonly CheckInEvent[] {
  const seen = new Set<string>();
  const result: CheckInEvent[] = [];
  for (const event of events) {
    if (event.operationId !== null) {
      if (seen.has(event.operationId)) continue;
      seen.add(event.operationId);
    }
    result.push(event);
  }
  return result;
}
