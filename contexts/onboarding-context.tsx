import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type BehaviorDirection = 'build' | 'cut' | 'stop';
export type MeasurementMode = 'completion' | 'count' | 'time' | 'amount' | 'abstinence';

type OnboardingContextValue = {
  behaviorDirection: BehaviorDirection | null;
  behaviorText: string;
  definitionText: string;
  goal: string;
  measurementMode: MeasurementMode | null;
  setBehaviorDirection: (direction: BehaviorDirection | null) => void;
  setBehaviorText: (text: string) => void;
  setDefinitionText: (text: string) => void;
  setGoal: (goal: string) => void;
  setMeasurementMode: (mode: MeasurementMode | null) => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [goal, setGoal] = useState('');
  const [behaviorDirection, setBehaviorDirection] =
    useState<BehaviorDirection | null>(null);
  const [behaviorText, setBehaviorText] = useState('');
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode | null>(null);
  const [definitionText, setDefinitionText] = useState('');

  const value = useMemo(
    () => ({
      behaviorDirection,
      behaviorText,
      definitionText,
      goal,
      measurementMode,
      setBehaviorDirection,
      setBehaviorText,
      setDefinitionText,
      setGoal,
      setMeasurementMode,
    }),
    [behaviorDirection, behaviorText, definitionText, goal, measurementMode],
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
