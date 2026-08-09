// Verbatim copy of domain/challenge/check-in/period-state.ts for the Deno edge-function runtime boundary
// (Deno requires explicit .ts extensions on relative imports; Metro/tsc
// resolve extensionless ones, so the source of truth can't be imported
// directly). Only change from the source: added '.ts' to relative
// imports below. Keep byte-identical otherwise -- do not hand-edit logic
// here; change domain/challenge/check-in instead and re-copy.
import { ChallengePeriod } from '../periods.ts';
import { IsoDateTime } from '../types.ts';
import { compareIso } from './iso-time.ts';
import { reduceEffectiveFact } from './reduction.ts';
import { resolveStopHistory } from './stop-reduction.ts';
import { CheckInEvent, CheckInFact } from './types.ts';

/**
 * The derived state of one period, per docs/CHECK_IN_ENGINE.md. Deliberately
 * keeps "closed with no recorded fact" (`closed_without_input`) distinct
 * from "closed with an explicit fact that fell short" (`not_satisfied`) —
 * collapsing the two would silently treat silence as an explicit failure
 * report, which the check-in engine must never assume on its own (see
 * `evaluateChallenge`'s no-response handling for where that call is
 * actually made, deliberately one layer up from here).
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

/**
 * `period.endsAt` is the tracking boundary; `period.reportingClosesAt` is
 * the later, separate self-service reporting/correction deadline (see
 * `periods.ts`). A period stays `open` — still accepting a first report or
 * a correction — until `reportingClosesAt` passes, even once tracking
 * itself (`endsAt`) is long over. Only once the reporting deadline has
 * passed does this function commit to satisfied / not_satisfied /
 * closed_without_input.
 */
export function derivePeriodState(
  period: ChallengePeriod,
  eventsForPeriod: readonly CheckInEvent[],
  now: IsoDateTime,
): PeriodStateResult {
  if (compareIso(now, period.startsAt) < 0) return { ok: true, state: { kind: 'upcoming' } };

  if (period.target.type === 'maximum_lapses') {
    const history = resolveStopHistory(period, eventsForPeriod);
    if (!history.ok) return { ok: false, reason: history.reason };
    if (compareIso(now, period.reportingClosesAt) < 0) {
      return { ok: true, state: { kind: 'open', fact: history.mostRecentFact } };
    }
    // A genuine, uncorrected lapse is absorbing — it dominates regardless of
    // any later ordinary `stop_intact` attestation. Only a final intact
    // attestation timestamped after tracking ended and before the reporting
    // deadline can satisfy the period; an early-only intact ping followed
    // by silence through the deadline is not that, and falls through to
    // `closed_without_input` below.
    if (history.hasUncorrectedLapse) {
      return { ok: true, state: { kind: 'not_satisfied', fact: { kind: 'stop_lapse' } } };
    }
    if (history.hasFinalIntactAttestation) {
      return { ok: true, state: { kind: 'satisfied', fact: { kind: 'stop_intact' } } };
    }
    return { ok: true, state: { kind: 'closed_without_input' } };
  }

  const target = period.target;
  const reduction = reduceEffectiveFact(period.id, eventsForPeriod);
  if (!reduction.ok) return reduction;
  const fact = reduction.effective?.fact ?? null;

  if (compareIso(now, period.reportingClosesAt) < 0) return { ok: true, state: { kind: 'open', fact } };

  if (fact === null) return { ok: true, state: { kind: 'closed_without_input' } };
  const satisfiedResult = evaluateFactAgainstTarget(target, fact);
  if (satisfiedResult === 'mismatched') {
    return { ok: false, reason: 'the recorded fact does not match this period\'s target shape' };
  }
  return { ok: true, state: { kind: satisfiedResult, fact } };
}

function evaluateFactAgainstTarget(
  target: Extract<ChallengePeriod['target'], { type: 'completion_target' } | { type: 'maximum_value' }>,
  fact: CheckInFact,
): 'satisfied' | 'not_satisfied' | 'mismatched' {
  if (target.type === 'completion_target') {
    if (fact.kind !== 'build_completion') return 'mismatched';
    return fact.completions >= target.target ? 'satisfied' : 'not_satisfied';
  }
  // maximum_value
  if (fact.kind !== 'cut_back_total') return 'mismatched';
  if (fact.unit !== target.measurement.unit) return 'mismatched';
  return fact.total <= target.maximum ? 'satisfied' : 'not_satisfied';
}
