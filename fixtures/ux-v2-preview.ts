// Representative, hand-authored content for UX v2 visual review. None of
// this is read from or written to any repository — see
// contexts/ux-v2-preview-context.tsx for how it's gated behind an explicit,
// clearly-labeled demo toggle (Me) or a permanent preview tag (Kin,
// Progress, which have no real backend yet at all). Home itself no longer
// has a demo mode — it always reflects real, persisted challenge state.

export const demoMeStats = { completed: 8, active: 2, failed: 3 };

export const demoKinActivity = [
  { id: 'demo-1', name: 'Anna', behavior: 'Morning run', event: 'Completed her week', detail: '3 / 3' },
  { id: 'demo-2', name: 'Erik', behavior: 'No takeout', event: 'Missed yesterday', detail: null },
  { id: 'demo-3', name: 'Lisa', behavior: 'Reading', event: 'Started a 30 day challenge', detail: null },
] as const;

export const demoKinPeople = [
  { id: 'demo-1', name: 'Anna' },
  { id: 'demo-2', name: 'Erik' },
  { id: 'demo-3', name: 'Lisa' },
] as const;

export const demoProgressDetail = {
  consistency: 78,
  currentStreakWeeks: 4,
  weeks: [
    { label: 'W1', value: 40 },
    { label: 'W2', value: 65 },
    { label: 'W3', value: 90 },
    { label: 'W4', value: 78 },
  ],
  challengeCompletion: { name: 'No nicotine', completed: 12, total: 21 },
};
