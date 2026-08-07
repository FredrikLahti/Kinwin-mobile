import { ChallengePeriod } from '../periods';
import { IsoDateTime } from '../types';
import { compareIso } from './iso-time';
import { reduceEffectiveFact } from './reduction';
import { CheckInEvent, CheckInFact } from './types';

/**
 * The derived state of one period, per docs/CHECK_IN_ENGINE.md. Deliberately
 * keeps "closed with no recorded fact" (`closed_without_input`) distinct
 * from "closed with an explicit fact that fell short" (`not_satisfied`) —
 * collapsing the two would silently treat silence as an explicit failure
 * report, which the check-in engine must never assume on its own (see
 * `evaluateChallenge`'s `noResponsePolicy` for where that call is actually
 * made, deliberately one layer up from here).
 */
export type EffectivePeriodState =
  | { readonly kind: 'upcoming' }
  | { readonly kind: 'open'; readonly fact: CheckInFact | null }
  | { readonly kind: 'satisfied'; readonly fact: CheckInFact }
  | { readonly kind: 'not_satisfied'; readonly fact: CheckInFact }
  | { readonly kind: 'closed_without_input' };

export type PeriodStateResult =
  | { readonly ok: true; readonly state: EffectivePeriodState }
  | { readonly ok: false; readonly reason: string };

export function derivePeriodState(
  period: ChallengePeriod,
  eventsForPeriod: readonly CheckInEvent[],
  now: IsoDateTime,
): PeriodStateResult {
  const reduction = reduceEffectiveFact(period.id, eventsForPeriod);
  if (!reduction.ok) return reduction;
  const fact = reduction.effective?.fact ?? null;

  if (compareIso(now, period.startsAt) < 0) return { ok: true, state: { kind: 'upcoming' } };
  if (compareIso(now, period.endsAt) < 0) return { ok: true, state: { kind: 'open', fact } };

  if (fact === null) return { ok: true, state: { kind: 'closed_without_input' } };
  const satisfiedResult = evaluateFactAgainstTarget(period.target, fact);
  if (satisfiedResult === 'mismatched') {
    return { ok: false, reason: 'the recorded fact does not match this period\'s target shape' };
  }
  return { ok: true, state: { kind: satisfiedResult, fact } };
}

function evaluateFactAgainstTarget(
  target: ChallengePeriod['target'],
  fact: CheckInFact,
): 'satisfied' | 'not_satisfied' | 'mismatched' {
  if (target.type === 'completion_target') {
    if (fact.kind !== 'build_completion') return 'mismatched';
    return fact.completions >= target.target ? 'satisfied' : 'not_satisfied';
  }
  if (target.type === 'maximum_value') {
    if (fact.kind !== 'cut_back_total') return 'mismatched';
    if (fact.unit !== target.measurement.unit) return 'mismatched';
    return fact.total <= target.maximum ? 'satisfied' : 'not_satisfied';
  }
  // maximum_lapses
  if (fact.kind !== 'stop_intact' && fact.kind !== 'stop_lapse') return 'mismatched';
  return fact.kind === 'stop_intact' ? 'satisfied' : 'not_satisfied';
}
