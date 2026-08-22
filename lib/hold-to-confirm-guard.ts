export type HoldGuardInputs = {
  readonly alreadyFired: boolean;
  readonly disabled: boolean;
};

/**
 * Whether a hold-to-confirm press may begin, or — using the identical rule —
 * whether a completed hold (or an accessibility "activate" action standing
 * in for one) may actually invoke its action. One predicate covers both
 * moments because the requirement is the same either way: no new hold may
 * start, and no completion may fire, once this exact hold cycle has already
 * fired once (`alreadyFired`), or while the caller has the control disabled
 * (`disabled` — e.g. a previous activation is still in flight).
 */
export function canBeginOrCompleteHold({ alreadyFired, disabled }: HoldGuardInputs): boolean {
  return !alreadyFired && !disabled;
}

/**
 * Whether the internal "already fired" guard should be cleared. True only on
 * the transition from disabled -> enabled (e.g. a failed activation the
 * caller now allows retrying) — never spontaneously while still in flight,
 * and never merely because `disabled` happened to be false on two
 * consecutive checks.
 */
export function shouldClearFiredGuard(previousDisabled: boolean, nextDisabled: boolean): boolean {
  return previousDisabled && !nextDisabled;
}

export type ReducedMotionHoldFeedbackInputs = {
  readonly disabled: boolean;
  readonly holding: boolean;
  readonly reducedMotion: boolean;
};

/**
 * Whether the Reduce Motion-only static "Keep holding…" label/background
 * should show right now. Reduce Motion removes the animated fill, but the
 * hold itself is still a real ~600ms requirement — this is the non-animated
 * substitute feedback that tells a sighted Reduce Motion user their press
 * is registering at all. Never true once the caller has disabled the
 * control (activation is already in flight): at that point the caller's
 * own label ("Activating…") is the honest state, not a stale "keep
 * holding" that could read as still waiting on the user.
 */
export function shouldShowReducedMotionHoldFeedback({ disabled, holding, reducedMotion }: ReducedMotionHoldFeedbackInputs): boolean {
  return reducedMotion && holding && !disabled;
}
