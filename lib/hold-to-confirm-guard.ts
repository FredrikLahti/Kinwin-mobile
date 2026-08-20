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
