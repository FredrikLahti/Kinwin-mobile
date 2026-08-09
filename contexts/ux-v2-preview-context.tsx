import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

// Session-only, presentation-layer toggle. It never reads or writes
// anything through the real repositories — flipping it only changes which
// React tree Home/Me render (fixtures/ux-v2-preview.ts vs real repository
// data), so it can never be mistaken for, or leak into, persisted
// production data. Defaults OFF: real, persisted data is the normal Home
// path now that it exists (activation + check-in are genuinely wired to
// Supabase — see lib/supabase/active-challenge-repository.ts). This toggle
// remains only as an isolated dev aid for visual review of states that are
// otherwise hard to reach on a fresh account. Resets to off every reload.
type UXV2PreviewContextValue = {
  demoEnabled: boolean;
  toggleDemo: () => void;
};

const UXV2PreviewContext = createContext<UXV2PreviewContextValue | null>(null);

export function UXV2PreviewProvider({ children }: { children: ReactNode }) {
  const [demoEnabled, setDemoEnabled] = useState(false);
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
