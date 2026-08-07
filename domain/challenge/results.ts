import { ActivatedChallengeSnapshot, IsoDateTime, SuccessRuleSnapshot } from './types';
import { ChallengePeriod } from './periods';
import { cutBackContinuityCheck } from './check-in/cut-back-continuity';
import { derivePeriodState, EffectivePeriodState } from './check-in/period-state';
import { CheckInEvent } from './check-in/types';

export type ChallengeResultStatus = 'pending' | 'on_track' | 'at_risk' | 'success' | 'failure';

export type NotEvaluableReason =
  | 'unsupported_rule_version'
  | 'periods_not_generated'
  | 'periods_not_closed'
  | 'events_awaiting_server_timestamp'
  | 'malformed_event_chain'
  | 'unsupported_stop_lapse_rule';

/**
 * LOCKED V1 product rule: once a period's reporting deadline has passed
 * (see periods.ts's `reportingClosesAt`) with no required final report,
 * that period is deemed NOT SATISFIED for challenge-result purposes —
 * applied consistently to build, cut_back, and stop. This is a *product
 * consequence rule*, not a claim about what happened: the recorded truth
 * (surfaced at the period level as `closed_without_input`, never
 * downgraded to `not_satisfied` there — see check-in/period-state.ts) is
 * "no input was received"; whether that counts against the user is this
 * one policy call, made once, here. Before the reporting deadline, the
 * result stays `pending` regardless of this policy — see `isClosed` below,
 * which `evaluateChallenge` will not treat as closed until then.
 */
const NO_RESPONSE_SUCCEEDS = false;

export type ChallengeEvaluation =
  | {
      readonly evaluable: true;
      readonly status: 'success' | 'failure';
      readonly evaluatedAt: IsoDateTime;
      readonly ruleEngineVersion: 1;
      readonly periodStates: readonly EffectivePeriodState[];
    }
  | {
      readonly evaluable: false;
      readonly status: 'pending';
      readonly reasons: readonly NotEvaluableReason[];
      readonly ruleEngineVersion: 1;
      readonly periodStates: readonly EffectivePeriodState[] | null;
    };

export type ChallengeEvaluationInput = {
  readonly challenge: ActivatedChallengeSnapshot;
  readonly periods: readonly ChallengePeriod[];
  readonly events: readonly CheckInEvent[];
  readonly evaluatedAt: IsoDateTime;
};

type EvaluatedPeriod = { readonly period: ChallengePeriod; readonly state: EffectivePeriodState };

/**
 * The trusted, deterministic challenge-level evaluator — see
 * docs/CHECK_IN_ENGINE.md for the full write-up. Real for all three
 * directions: build, cut_back (aggregate threshold AND continuity
 * safeguard, both locked V1 rules — see check-in/cut-back-continuity.ts),
 * and stop.
 */
export function evaluateChallenge(input: ChallengeEvaluationInput): ChallengeEvaluation {
  const { challenge, periods, events, evaluatedAt } = input;

  if (challenge.ruleEngineVersion !== 1 || challenge.successRule.ruleVersion !== 1) {
    return notEvaluable(['unsupported_rule_version'], null);
  }
  if (periods.length === 0) return notEvaluable(['periods_not_generated'], null);
  if (events.some((event) => event.serverRecordedAt === null)) {
    return notEvaluable(['events_awaiting_server_timestamp'], null);
  }

  const orderedPeriods = [...periods].sort((a, b) => a.periodNumber - b.periodNumber);
  const evaluated: EvaluatedPeriod[] = [];
  for (const period of orderedPeriods) {
    const eventsForPeriod = events.filter((event) => event.periodId === period.id);
    const result = derivePeriodState(period, eventsForPeriod, evaluatedAt);
    if (!result.ok) return notEvaluable(['malformed_event_chain'], null);
    evaluated.push({ period, state: result.state });
  }

  const periodStates = evaluated.map((entry) => entry.state);
  if (!evaluated.every((entry) => isClosed(entry.state))) return notEvaluable(['periods_not_closed'], periodStates);

  switch (challenge.successRule.direction) {
    case 'build':
      return evaluateBuild(challenge.successRule, evaluated, evaluatedAt);
    case 'cut_back':
      return evaluateCutBack(challenge.successRule, evaluated, evaluatedAt);
    case 'stop':
      return evaluateStop(challenge.successRule, evaluated, evaluatedAt);
  }
}

function evaluateBuild(
  rule: Extract<SuccessRuleSnapshot, { direction: 'build' }>,
  evaluated: readonly EvaluatedPeriod[],
  evaluatedAt: IsoDateTime,
): ChallengeEvaluation {
  const periodStates = evaluated.map((entry) => entry.state);

  // Capped per period at that period's own target: `totalPlannedCompletions`
  // is derived as a sum of per-period targets (success-rule.ts), so letting
  // one over-completed period "bank" credit toward another would silently
  // change what the aggregate threshold means. A documented modeling
  // decision, not a mechanical necessity — see docs/CHECK_IN_ENGINE.md.
  // A closed_without_input period contributes 0 — a known fact for build,
  // not a policy call (see NO_RESPONSE_SUCCEEDS's doc comment).
  let total = 0;
  for (const { period, state } of evaluated) {
    if (state.kind === 'closed_without_input') continue;
    if (state.kind !== 'satisfied' && state.kind !== 'not_satisfied') {
      return notEvaluable(['malformed_event_chain'], periodStates);
    }
    if (state.fact.kind !== 'build_completion' || period.target.type !== 'completion_target') {
      return notEvaluable(['malformed_event_chain'], periodStates);
    }
    total += Math.min(state.fact.completions, period.target.target);
  }

  const totalOk = total >= rule.minimumRequiredCompletions;
  const continuityOk = checkBuildContinuity(evaluated, rule.continuitySafeguard);
  return finalResult(totalOk && continuityOk, evaluatedAt, periodStates);
}

function checkBuildContinuity(
  evaluated: readonly EvaluatedPeriod[],
  safeguard: Extract<SuccessRuleSnapshot, { direction: 'build' }>['continuitySafeguard'],
): boolean {
  if (safeguard.type === 'minimum_completions_per_week') {
    return evaluated.every(({ state }) => {
      if (state.kind === 'closed_without_input') return 0 >= safeguard.minimum;
      if (state.kind !== 'satisfied' && state.kind !== 'not_satisfied') return false;
      return state.fact.kind === 'build_completion' && state.fact.completions >= safeguard.minimum;
    });
  }
  // maximum_consecutive_missed_days | maximum_consecutive_missed_weeks
  let run = 0;
  for (const { state } of evaluated) {
    run = state.kind === 'satisfied' ? 0 : run + 1;
    if (run > safeguard.maximum) return false;
  }
  return true;
}

/**
 * Locked V1: succeeds only if BOTH the aggregate `minimumPeriodsWithinLimit`
 * threshold and the continuity safeguard (`cut-back-continuity.ts`) are
 * met. `closed_without_input` counts as "exceeded" for both — see
 * cut-back-continuity.ts's doc comment for why, and NO_RESPONSE_SUCCEEDS
 * above for how that's consistent with the locked no-response policy
 * generally.
 */
function evaluateCutBack(
  rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }>,
  evaluated: readonly EvaluatedPeriod[],
  evaluatedAt: IsoDateTime,
): ChallengeEvaluation {
  const periodStates = evaluated.map((entry) => entry.state);
  const periodsWithinLimit = periodStates.filter((state) => state.kind === 'satisfied').length;
  const aggregateOk = periodsWithinLimit >= rule.minimumPeriodsWithinLimit;
  const continuity = cutBackContinuityCheck(periodStates, rule.continuitySafeguard);
  return finalResult(aggregateOk && continuity.withinContinuity, evaluatedAt, periodStates);
}

function evaluateStop(
  rule: Extract<SuccessRuleSnapshot, { direction: 'stop' }>,
  evaluated: readonly EvaluatedPeriod[],
  evaluatedAt: IsoDateTime,
): ChallengeEvaluation {
  const periodStates = evaluated.map((entry) => entry.state);
  if (rule.lapseRule.type !== 'zero_lapses') {
    // 'allowance' would require counting distinct lapse occurrences across
    // the single continuous period's whole history in a way this module's
    // sticky-lapse model isn't specified to do (see
    // check-in/stop-reduction.ts and docs/CHECK_IN_ENGINE.md). Also
    // unreachable for any validly-activated V1 challenge —
    // domain/challenge/validation.ts already requires
    // `maximumLapses === 0` — so this only guards malformed input.
    return notEvaluable(['unsupported_stop_lapse_rule'], periodStates);
  }

  // A single continuous period. Its state was derived by
  // check-in/period-state.ts's Stop branch, which already applies the
  // sticky-lapse / final-attestation-window rules — evaluateStop just
  // reads the result, same shape as the other two directions.
  const state = evaluated[0]?.state;
  if (!state) return notEvaluable(['periods_not_generated'], null);

  if (state.kind === 'satisfied') {
    if (state.fact.kind !== 'stop_intact') return notEvaluable(['malformed_event_chain'], periodStates);
    return finalResult(true, evaluatedAt, periodStates);
  }
  if (state.kind === 'not_satisfied') {
    if (state.fact.kind !== 'stop_lapse') return notEvaluable(['malformed_event_chain'], periodStates);
    return finalResult(false, evaluatedAt, periodStates);
  }
  // closed_without_input: no qualifying final intact attestation was ever
  // recorded within the reporting window (whether or not an earlier
  // stop_intact ping exists — see period-state.ts). Locked no-response
  // policy: not satisfied.
  return finalResult(NO_RESPONSE_SUCCEEDS, evaluatedAt, periodStates);
}

function isClosed(state: EffectivePeriodState): boolean {
  return state.kind === 'satisfied' || state.kind === 'not_satisfied' || state.kind === 'closed_without_input';
}

function finalResult(success: boolean, evaluatedAt: IsoDateTime, periodStates: readonly EffectivePeriodState[]): ChallengeEvaluation {
  return { evaluable: true, status: success ? 'success' : 'failure', evaluatedAt, ruleEngineVersion: 1, periodStates };
}

function notEvaluable(reasons: readonly NotEvaluableReason[], periodStates: readonly EffectivePeriodState[] | null): ChallengeEvaluation {
  return { evaluable: false, status: 'pending', reasons: [...new Set(reasons)], ruleEngineVersion: 1, periodStates };
}
