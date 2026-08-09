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
