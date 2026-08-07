import { EffectivePeriodState } from './period-state';

export type CutBackContinuitySafeguard =
  | { readonly type: 'maximum_consecutive_exceeded_days'; readonly maximum: number }
  | { readonly type: 'maximum_consecutive_exceeded_weeks'; readonly maximum: number };

export type CutBackContinuityResult = {
  readonly withinContinuity: boolean;
  readonly longestConsecutiveExceededRun: number;
  readonly safeguard: CutBackContinuitySafeguard;
};

/**
 * LOCKED V1 product rule, wired into `evaluateChallenge`'s cut_back branch
 * in results.ts — see docs/CHECK_IN_ENGINE.md's "Cut back continuity"
 * section. Mirrors the already-locked build continuity pattern
 * (`SuccessRuleSnapshot`'s `cut_back` `continuitySafeguard`, produced by
 * `domain/challenge/success-rule.ts`): no more than N consecutive exceeded
 * periods in a row (daily: `maximum_consecutive_exceeded_days`, maximum 2;
 * weekly: `maximum_consecutive_exceeded_weeks`, maximum 1). A cut-back
 * challenge succeeds only if BOTH the aggregate `minimumPeriodsWithinLimit`
 * threshold and this continuity safeguard are met.
 *
 * A `closed_without_input` period — no total was ever reported for it —
 * counts as "exceeded" for this run, same as an explicit over-limit total:
 * a consecutive run of silence during a cut-back challenge is at least as
 * concerning as a reported over-limit total, not less, and this keeps the
 * treatment of silence consistent with the locked no-response policy
 * (absence of required input, after the reporting deadline, is deemed not
 * satisfied) rather than treating it as a free pass that never breaks a
 * streak.
 */
export function cutBackContinuityCheck(
  periodStatesInOrder: readonly EffectivePeriodState[],
  safeguard: CutBackContinuitySafeguard,
): CutBackContinuityResult {
  let run = 0;
  let longest = 0;
  for (const state of periodStatesInOrder) {
    const exceeded = state.kind === 'not_satisfied' || state.kind === 'closed_without_input';
    run = exceeded ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return {
    withinContinuity: longest <= safeguard.maximum,
    longestConsecutiveExceededRun: longest,
    safeguard,
  };
}
