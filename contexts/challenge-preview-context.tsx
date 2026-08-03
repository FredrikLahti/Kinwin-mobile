import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ObstacleCategory, PlaybookEntry, PreviewEvent, StrategyCategory } from '@/lib/challenge-preview-view-model';
import { useOnboarding } from '@/contexts/onboarding-context';

export type StopPreviewStatus = 'intact' | 'lapse' | null;
export const OBSTACLES: { label: string; value: ObstacleCategory }[] = [
  { label: 'I forgot', value: 'forgot' }, { label: 'Low energy', value: 'low_energy' },
  { label: 'Stress or emotions', value: 'stress' }, { label: 'My environment made it easy', value: 'environment' },
  { label: 'Social situation', value: 'social' }, { label: 'Something else', value: 'other' },
];
export const STRATEGIES: { label: string; value: StrategyCategory }[] = [
  { label: 'Resume at the next planned opportunity', value: 'next_opportunity' }, { label: 'Change the environment', value: 'change_environment' },
  { label: 'Prepare earlier', value: 'prepare_earlier' }, { label: 'Use a replacement behavior', value: 'replacement' },
  { label: 'Ask someone for support', value: 'ask_support' }, { label: 'Choose my own action', value: 'custom' },
];

type ChallengePreviewContextValue = {
  events: readonly PreviewEvent[]; playbookEntries: readonly PlaybookEntry[];
  buildCompletions: number; cutTotal: number | null; stopStatus: StopPreviewStatus; hasPreviewState: boolean;
  recordBuildCompletion: (target: number) => void; recordCutTotal: (value: number) => void; recordStopStatus: (status: Exclude<StopPreviewStatus, null>) => void;
  createPlaybookEntry: (input: { obstacle: ObstacleCategory; strategy: StrategyCategory; action: string; note: string; source: 'recovery' | 'manual' }) => void;
  completeRecovery: (id: string) => void; resetPreviewCheckIns: () => void;
};
const ChallengePreviewContext = createContext<ChallengePreviewContextValue | null>(null);

export function ChallengePreviewProvider({ children }: { children: ReactNode }) {
  const { behaviorDirection, behaviorText, durationWeeks, measurementMode, rhythm } = useOnboarding();
  const definitionKey = JSON.stringify({ behaviorDirection, behaviorText: behaviorText.trim(), durationWeeks, measurementMode, rhythm });
  const previousDefinitionKey = useRef(definitionKey); const nextOrder = useRef(1);
  const [events, setEvents] = useState<PreviewEvent[]>([]); const [playbookEntries, setPlaybookEntries] = useState<PlaybookEntry[]>([]);
  type NewPreviewEvent = { type: 'build_completion' } | { type: 'cut_total'; value: number } | { type: 'stop_status'; status: 'intact' | 'lapse' };
  const append = (event: NewPreviewEvent) => { const order = nextOrder.current++; setEvents((current) => [...current, { ...event, id: `preview-event-${order}`, order } as PreviewEvent]); };
  const buildCompletions = events.filter((event) => event.type === 'build_completion').length;
  const cutEvents = events.filter((event): event is Extract<PreviewEvent, { type: 'cut_total' }> => event.type === 'cut_total');
  const cutTotal = cutEvents.length ? cutEvents[cutEvents.length - 1].value : null;
  const stopEvents = events.filter((event): event is Extract<PreviewEvent, { type: 'stop_status' }> => event.type === 'stop_status');
  const stopStatus: StopPreviewStatus = stopEvents.some((event) => event.status === 'lapse') ? 'lapse' : stopEvents.length ? stopEvents[stopEvents.length - 1].status : null;
  const resetPreviewCheckIns = () => { setEvents([]); setPlaybookEntries([]); nextOrder.current = 1; };
  useEffect(() => { if (previousDefinitionKey.current !== definitionKey) { previousDefinitionKey.current = definitionKey; resetPreviewCheckIns(); } }, [definitionKey]);
  const value = useMemo<ChallengePreviewContextValue>(() => ({
    events, playbookEntries, buildCompletions, cutTotal, stopStatus, hasPreviewState: events.length > 0 || playbookEntries.length > 0,
    recordBuildCompletion: (target) => { if (buildCompletions < target) append({ type: 'build_completion' }); },
    recordCutTotal: (value) => append({ type: 'cut_total', value }),
    recordStopStatus: (status) => append({ type: 'stop_status', status }),
    createPlaybookEntry: ({ obstacle, strategy, action, note, source }) => { const order = nextOrder.current++; const last = events[events.length - 1]; setPlaybookEntries((current) => [...current, { id: `playbook-${order}`, order, source, sourceEventType: last?.type ?? null, direction: behaviorDirection ?? 'build', obstacle, strategy, recoveryAction: action.trim(), note: note.trim() || null, recoveryStatus: source === 'recovery' ? 'active' : 'completed', behavior: behaviorText.trim() }]); },
    completeRecovery: (id) => setPlaybookEntries((current) => current.map((entry) => entry.id === id ? { ...entry, recoveryStatus: 'completed' } : entry)), resetPreviewCheckIns,
  }), [behaviorDirection, behaviorText, buildCompletions, cutTotal, events, playbookEntries, stopStatus]);
  return <ChallengePreviewContext.Provider value={value}>{children}</ChallengePreviewContext.Provider>;
}
export function useChallengePreview() { const context = useContext(ChallengePreviewContext); if (!context) throw new Error('useChallengePreview must be used within ChallengePreviewProvider'); return context; }
