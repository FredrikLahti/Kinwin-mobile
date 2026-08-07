import { EffectivePeriodState } from './period-state';

export type CutBackContinuitySafeguard =
  | { readonly type: 'maximum_consecutive_exceeded_days'; readonly maximum: number }
  | { readonly type: 'maximum_consecutive_exceeded_weeks'; readonly maximum: number };

export type CutBackContinuityRecommendation = {
  readonly withinRecommendedContinuity: boolean;
  readonly longestConsecutiveExceededRun: number;
  readonly safeguard: CutBackContinuitySafeguard;
};

/**
 * PENDING FOUNDER APPROVAL — not called by `evaluateChallenge`. See
 * docs/CHECK_IN_ENGINE.md's "Cut back continuity — unresolved" section for
 * the exact ambiguity, worked examples, and why this is kept out of the
 * trusted decision path rather than wired in.
 *
 * This is a *recommendation*, structured to mirror the already-locked build
 * continuity pattern (`SuccessRuleSnapshot`'s `cut_back` `continuitySafeguard`,
 * produced by `domain/challenge/success-rule.ts`): no more than N
 * consecutive exceeded periods in a row. A `closed_without_input` period —
 * no total was ever reported — counts as "exceeded" for this specific
 * recommendation, on the conservative theory that a consecutive run of
 * silence during a cut-back challenge is at least as concerning as a
 * reported over-limit total, not less. That is a genuine product call, not
 * a mechanical necessity — see the doc for the alternative (treating
 * silence as neutral, i.e. never breaking a streak) and why it was not
 * chosen as the recommendation.
 */
export function recommendedCutBackContinuityCheck(
  periodStatesInOrder: readonly EffectivePeriodState[],
  safeguard: CutBackContinuitySafeguard,
): CutBackContinuityRecommendation {
  let run = 0;
  let longest = 0;
  for (const state of periodStatesInOrder) {
    const exceeded = state.kind === 'not_satisfied' || state.kind === 'closed_without_input';
    run = exceeded ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return {
    withinRecommendedContinuity: longest <= safeguard.maximum,
    longestConsecutiveExceededRun: longest,
    safeguard,
  };
}
