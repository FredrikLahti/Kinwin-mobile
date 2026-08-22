// Pure outcome-classification only — no expo-haptics import here on purpose.
// lib/haptics.ts itself pulls in the real native `expo-haptics` module at
// its top level, which the plain node --test harness cannot execute; a
// pure decision module kept fully standalone (no import of lib/haptics.ts
// or any React Native module) is what makes this mapping testable at all.
// Callers import both this module (to decide) and lib/haptics.ts (to act).

export type CheckInFactKind = 'build_completion' | 'cut_back_total' | 'stop_intact' | 'stop_lapse';
export type CheckInHapticOutcome = 'important' | 'consequence';

/**
 * Every ordinary positive/intact check-in stays at the restrained
 * "Important" tier — this fires many times over a challenge's life and must
 * never feel like a celebration. A recorded lapse is the one check-in
 * outcome that gets the heavier "Consequence" tier — still not an error.
 */
export function resolveCheckInHapticOutcome(kind: CheckInFactKind): CheckInHapticOutcome {
  return kind === 'stop_lapse' ? 'consequence' : 'important';
}

export type TerminalChallengeStatus = 'completed_success' | 'completed_failure';
export type ChallengeResultHapticOutcome = 'success' | 'consequence';

/**
 * The first presentation of a finalized challenge's result: success plays
 * once, positively; failure plays once, as a neutral/heavier consequence —
 * never the Error notification pattern, since a completed failure is a real
 * product outcome, not a system failure.
 */
export function resolveChallengeResultHapticOutcome(status: TerminalChallengeStatus): ChallengeResultHapticOutcome {
  return status === 'completed_success' ? 'success' : 'consequence';
}
