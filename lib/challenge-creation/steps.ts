import { BehaviorDirection } from '@/contexts/onboarding-context';

// The creation flow's screen count genuinely differs by challenge type:
// Build asks a separate frequency question after its rule screen, Limit and
// Avoid do not (the limit's period already is the frequency; Avoid has no
// frequency concept at all). This computes the right {currentStep,
// totalSteps} for the shared progress bar from wherever a screen sits in
// that variable sequence, instead of every screen hard-coding a number that
// would be wrong for two of the three types.
export type ChallengeCreationStep =
  | 'goal' | 'type' | 'rule' | 'frequency' | 'duration' | 'recipients' | 'consequence' | 'review';

export function getStepInfo(
  direction: BehaviorDirection | null,
  step: ChallengeCreationStep,
): { readonly currentStep: number; readonly totalSteps: number } {
  // Direction is not chosen yet on goal/type — default to Build's (longer)
  // sequence so the progress bar doesn't jump backward once a shorter type
  // is picked.
  const isBuild = direction === 'build' || direction === null;
  const totalSteps = isBuild ? 8 : 7;
  const positions: Record<ChallengeCreationStep, number> = isBuild
    ? { goal: 1, type: 2, rule: 3, frequency: 4, duration: 5, recipients: 6, consequence: 7, review: 8 }
    : { goal: 1, type: 2, rule: 3, frequency: 3, duration: 4, recipients: 5, consequence: 6, review: 7 };
  return { currentStep: positions[step], totalSteps };
}

// The concrete /create/* route sequence per direction — matches exactly
// what each screen's own "continue" handler pushes to (see goal.tsx,
// type.tsx's NEXT_SCREEN, build/limit/avoid/frequency/duration/recipients/
// consequence.tsx). 'rule' resolves to build/limit/avoid depending on
// direction; 'frequency' only exists for Build.
const BUILD_ROUTE_SEQUENCE = [
  '/create/goal', '/create/type', '/create/build', '/create/frequency',
  '/create/duration', '/create/recipients', '/create/consequence', '/create/review',
] as const;
const CUT_ROUTE_SEQUENCE = [
  '/create/goal', '/create/type', '/create/limit',
  '/create/duration', '/create/recipients', '/create/consequence', '/create/review',
] as const;
const STOP_ROUTE_SEQUENCE = [
  '/create/goal', '/create/type', '/create/avoid',
  '/create/duration', '/create/recipients', '/create/consequence', '/create/review',
] as const;

function creationRouteSequence(direction: BehaviorDirection | null): readonly string[] {
  if (direction === 'cut') return CUT_ROUTE_SEQUENCE;
  if (direction === 'stop') return STOP_ROUTE_SEQUENCE;
  // Direction not chosen yet (or 'build'): only goal/type are reachable
  // without a direction, and both are the same common prefix in every
  // sequence, so defaulting to Build's here is never wrong for them —
  // matches getStepInfo's own "default to Build's sequence" convention.
  return BUILD_ROUTE_SEQUENCE;
}

/**
 * The logical previous /create/* route for Back navigation, computed from
 * the challenge-type route sequence itself rather than whatever happens to
 * be in the native navigation stack. This matters because a session
 * resumed mid-flow (Home pushing straight to e.g. /create/frequency) never
 * pushed the intermediate screens at all — a plain router.back() there
 * would pop straight to Home instead of the previous logical creation
 * step. Returns null for Goal (and for any unrecognized route) — the one
 * genuine creation → Home boundary.
 */
export function resolvePreviousCreationRoute(currentRoute: string, direction: BehaviorDirection | null): string | null {
  const sequence = creationRouteSequence(direction);
  const index = sequence.indexOf(currentRoute);
  if (index <= 0) return null;
  return sequence[index - 1];
}
