import { ActivatedChallengeSnapshot, IsoDateTime, SuccessRuleSnapshot } from './types';
import { ChallengePeriod } from './periods';
import { derivePeriodState, EffectivePeriodState } from './check-in/period-state';
import { CheckInEvent } from './check-in/types';

export type ChallengeResultStatus = 'pending' | 'on_track' | 'at_risk' | 'success' | 'failure';

export type NotEvaluableReason =
  | 'unsupported_rule_version'
  | 'periods_not_generated'
  | 'periods_not_closed'
  | 'events_awaiting_server_timestamp'
  | 'malformed_event_chain'
  | 'unsupported_stop_lapse_rule'
  | 'cut_back_continuity_policy_unresolved';

/**
 * How a `closed_without_input` period (nobody ever declared a fact for it)
 * folds into a challenge-level result. Only one policy is implemented in
 * v1 — see docs/CHECK_IN_ENGINE.md's "No-response" section for why
 * `treat_as_not_satisfied` is the recommendation, not an unquestionable
 * mechanical default. The parameter exists so a future, differently-decided
 * policy is a call-site change, not a rewrite of the evaluator.
 */
export type NoResponsePolicy = 'treat_as_not_satisfied';

const DEFAULT_NO_RESPONSE_POLICY: NoResponsePolicy = 'treat_as_not_satisfied';

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
  readonly noResponsePolicy?: NoResponsePolicy;
};

type EvaluatedPeriod = { readonly period: ChallengePeriod; readonly state: EffectivePeriodState };

/**
 * The trusted, deterministic challenge-level evaluator — see
 * docs/CHECK_IN_ENGINE.md for the full write-up. Real for `build` and
 * `stop`; `cut_back` always stays `evaluable: false` with reason
 * `cut_back_continuity_policy_unresolved` once its periods are closed,
 * because the exact continuity safeguard remains an unresolved product
 * decision (see `check-in/cut-back-continuity.ts`'s recommendation and
 * `computeCutBackAggregateOnly` below for the introspectable, not-trusted
 * pieces already built ahead of that decision).
 */
export function evaluateChallenge(input: ChallengeEvaluationInput): ChallengeEvaluation {
  const { challenge, periods, events, evaluatedAt } = input;
  const noResponsePolicy = input.noResponsePolicy ?? DEFAULT_NO_RESPONSE_POLICY;

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
      // Deliberately conservative: even a determinate aggregate-only result
      // is withheld, because it could be wrong once continuity is decided
      // (see docs/CHECK_IN_ENGINE.md). This is the one place the "genuinely
      // unresolved" boundary is load-bearing rather than decorative.
      return notEvaluable(['cut_back_continuity_policy_unresolved'], periodStates);
    case 'stop':
      return evaluateStop(challenge.successRule, evaluated, evaluatedAt, noResponsePolicy);
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

function evaluateStop(
  rule: Extract<SuccessRuleSnapshot, { direction: 'stop' }>,
  evaluated: readonly EvaluatedPeriod[],
  evaluatedAt: IsoDateTime,
  noResponsePolicy: NoResponsePolicy,
): ChallengeEvaluation {
  const periodStates = evaluated.map((entry) => entry.state);
  if (rule.lapseRule.type !== 'zero_lapses') {
    // 'allowance' would require counting distinct lapse occurrences across
    // the single continuous period's whole history, which this reduction's
    // "latest valid fact wins" model cannot do correctly (see
    // docs/CHECK_IN_ENGINE.md). Also unreachable for any validly-activated
    // V1 challenge — domain/challenge/validation.ts already requires
    // `maximumLapses === 0` — so this only guards malformed input.
    return notEvaluable(['unsupported_stop_lapse_rule'], periodStates);
  }

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
  // closed_without_input: nobody ever reported a status for the whole
  // challenge. Defaulting to success here would let silence win a
  // zero-lapse promise — see docs/CHECK_IN_ENGINE.md for why
  // `treat_as_not_satisfied` is the recommended (and only implemented) policy.
  const success = noResponsePolicyMeansSuccess(noResponsePolicy);
  return finalResult(success, evaluatedAt, periodStates);
}

function noResponsePolicyMeansSuccess(policy: NoResponsePolicy): boolean {
  switch (policy) {
    case 'treat_as_not_satisfied':
      return false;
  }
}

export type CutBackAggregateOnlyResult = {
  readonly satisfiedByAggregateAlone: boolean;
  readonly periodsWithinLimit: number;
  readonly totalPeriods: number;
  readonly ambiguousPeriodsExcludedFromWithinLimit: number;
};

/**
 * Introspection only — NEVER called by `evaluateChallenge`. Shows what the
 * aggregate-count-only result would be, ignoring continuity entirely, so
 * the gap between "what the locked aggregate rule alone can say" and "what
 * a real trusted evaluation would still need" stays visible and testable
 * ahead of the founder decision. See `check-in/cut-back-continuity.ts` for
 * the paired continuity recommendation.
 */
export function computeCutBackAggregateOnly(
  rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }>,
  periodStates: readonly EffectivePeriodState[],
): CutBackAggregateOnlyResult {
  const withinLimit = periodStates.filter((state) => state.kind === 'satisfied').length;
  const ambiguous = periodStates.filter((state) => state.kind === 'closed_without_input').length;
  return {
    satisfiedByAggregateAlone: withinLimit >= rule.minimumPeriodsWithinLimit,
    periodsWithinLimit: withinLimit,
    totalPeriods: rule.totalPeriods,
    ambiguousPeriodsExcludedFromWithinLimit: ambiguous,
  };
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
