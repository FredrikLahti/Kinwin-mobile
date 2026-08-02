import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type BehaviorDirection = 'build' | 'cut' | 'stop';

type OnboardingContextValue = {
  behaviorDirection: BehaviorDirection | null;
  behaviorText: string;
  goal: string;
  setBehaviorDirection: (direction: BehaviorDirection | null) => void;
  setBehaviorText: (text: string) => void;
  setGoal: (goal: string) => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [goal, setGoal] = useState('');
  const [behaviorDirection, setBehaviorDirection] =
    useState<BehaviorDirection | null>(null);
  const [behaviorText, setBehaviorText] = useState('');

  const value = useMemo(
    () => ({
      behaviorDirection,
      behaviorText,
      goal,
      setBehaviorDirection,
      setBehaviorText,
      setGoal,
    }),
    [behaviorDirection, behaviorText, goal],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }

  return context;
}
