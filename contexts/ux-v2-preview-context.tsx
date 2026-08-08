import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

// Session-only, presentation-layer toggle for UX v2 visual review. It never
// reads or writes anything through the real repositories — flipping it only
// changes which React tree Home/Me render (fixtures/ux-v2-preview.ts vs the
// real useActiveChallengeView() state), so it can never be mistaken for, or
// leak into, persisted production data. Defaults on so the screens are
// review-ready the moment the app opens; resets to on every reload.
type UXV2PreviewContextValue = {
  demoEnabled: boolean;
  toggleDemo: () => void;
};

const UXV2PreviewContext = createContext<UXV2PreviewContextValue | null>(null);

export function UXV2PreviewProvider({ children }: { children: ReactNode }) {
  const [demoEnabled, setDemoEnabled] = useState(true);
  const value = useMemo<UXV2PreviewContextValue>(
    () => ({ demoEnabled, toggleDemo: () => setDemoEnabled((current) => !current) }),
    [demoEnabled],
  );
  return <UXV2PreviewContext.Provider value={value}>{children}</UXV2PreviewContext.Provider>;
}

export function useUXV2Preview() {
  const context = useContext(UXV2PreviewContext);
  if (!context) throw new Error('useUXV2Preview must be used within UXV2PreviewProvider');
  return context;
}
