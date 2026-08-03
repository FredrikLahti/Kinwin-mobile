import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useOnboarding } from '@/contexts/onboarding-context';

export type StopPreviewStatus = 'intact' | 'lapse' | null;

type ChallengePreviewContextValue = {
  buildCompletions: number;
  cutTotal: number | null;
  hasPreviewState: boolean;
  recordBuildCompletion: (target: number) => void;
  recordCutTotal: (value: number) => void;
  recordStopStatus: (status: Exclude<StopPreviewStatus, null>) => void;
  resetPreviewCheckIns: () => void;
  stopStatus: StopPreviewStatus;
};

const ChallengePreviewContext = createContext<ChallengePreviewContextValue | null>(null);

export function ChallengePreviewProvider({ children }: { children: ReactNode }) {
  const { behaviorDirection, behaviorText, durationWeeks, measurementMode, rhythm } = useOnboarding();
  const definitionKey = JSON.stringify({
    behaviorDirection,
    behaviorText: behaviorText.trim(),
    durationWeeks,
    measurementMode,
    rhythm,
  });
  const previousDefinitionKey = useRef(definitionKey);
  const [buildCompletions, setBuildCompletions] = useState(0);
  const [cutTotal, setCutTotal] = useState<number | null>(null);
  const [stopStatus, setStopStatus] = useState<StopPreviewStatus>(null);

  const resetPreviewCheckIns = () => {
    setBuildCompletions(0);
    setCutTotal(null);
    setStopStatus(null);
  };

  useEffect(() => {
    if (previousDefinitionKey.current !== definitionKey) {
      previousDefinitionKey.current = definitionKey;
      resetPreviewCheckIns();
    }
  }, [definitionKey]);

  const value = useMemo(
    () => ({
      buildCompletions,
      cutTotal,
      hasPreviewState: buildCompletions > 0 || cutTotal !== null || stopStatus !== null,
      recordBuildCompletion: (target: number) =>
        setBuildCompletions((current) => Math.min(current + 1, target)),
      recordCutTotal: setCutTotal,
      recordStopStatus: setStopStatus,
      resetPreviewCheckIns,
      stopStatus,
    }),
    [buildCompletions, cutTotal, stopStatus],
  );

  return <ChallengePreviewContext.Provider value={value}>{children}</ChallengePreviewContext.Provider>;
}

export function useChallengePreview() {
  const context = useContext(ChallengePreviewContext);
  if (!context) throw new Error('useChallengePreview must be used within ChallengePreviewProvider');
  return context;
}
