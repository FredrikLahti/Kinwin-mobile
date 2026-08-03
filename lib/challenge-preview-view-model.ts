export type PreviewDirection = 'build' | 'cut' | 'stop';
export type PreviewMeasurement = 'completion' | 'count' | 'time' | 'amount' | 'abstinence';
export type Knowledge<T> =
  | { kind: 'known'; value: T }
  | { kind: 'not_recorded' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'not_applicable' };

export type PreviewEvent =
  | { id: string; order: number; type: 'build_completion' }
  | { id: string; order: number; type: 'cut_total'; value: number }
  | { id: string; order: number; type: 'stop_status'; status: 'intact' | 'lapse' };

export type ObstacleCategory = 'forgot' | 'low_energy' | 'stress' | 'environment' | 'social' | 'other';
export type StrategyCategory = 'next_opportunity' | 'change_environment' | 'prepare_earlier' | 'replacement' | 'ask_support' | 'custom';
export type PlaybookEntry = {
  id: string;
  order: number;
  source: 'recovery' | 'manual';
  sourceEventType: PreviewEvent['type'] | null;
  sourceEventId: string | null;
  direction: PreviewDirection;
  obstacle: ObstacleCategory;
  strategy: StrategyCategory;
  recoveryAction: string;
  note: string | null;
  recoveryStatus: 'active' | 'completed';
  behavior: string;
};

export type PreviewConfiguration = {
  direction: PreviewDirection;
  measurement: PreviewMeasurement;
  target: number;
  periodUnit: 'day' | 'week' | 'challenge';
  unit: string;
  durationWeeks: number;
  wholeRequirement: string;
  continuity: string | null;
};

export type CurrentPeriodView = {
  status: 'not_recorded' | 'in_progress' | 'met' | 'within_limit' | 'at_limit' | 'over_limit' | 'intact' | 'lapse';
  recorded: Knowledge<number | 'intact' | 'lapse'>;
  remaining: Knowledge<number>;
  headline: string;
  detail: string;
  /** The specific event id this status is derived from, so a recovery can be tied to the exact failure it addresses. */
  relevantEventId: string | null;
};

export type ActiveChallengeViewModel = {
  direction: PreviewDirection;
  measurement: PreviewMeasurement;
  currentPeriod: CurrentPeriodView;
  configuredRequirement: string;
  configuredDuration: string;
  continuity: Knowledge<string>;
  recordedPeriods: Knowledge<number>;
  successfulPeriods: Knowledge<number>;
  remainingPeriods: Knowledge<number>;
  minimumFuturePerformance: Knowledge<number>;
  successPossible: Knowledge<boolean>;
  twoFuturesState: 'not_recorded' | 'promise_path' | 'margin_narrowing' | 'boundary_crossed' | 'lapse_recorded' | 'recovery_active';
  consequenceState: 'preview_only_no_action';
  nextAction: { type: 'check_in' | 'update_total' | 'report_status' | 'continue_recovery' | 'review_playbook' | 'recovery_completed' | 'period_complete'; label: string; detail: string };
  latestInsight: Knowledge<PlaybookEntry>;
  history: { currentPeriodAvailable: boolean; previousPeriods: Knowledge<readonly never[]> };
};

export function buildActiveChallengeViewModel(input: {
  configuration: PreviewConfiguration;
  events: readonly PreviewEvent[];
  playbookEntries: readonly PlaybookEntry[];
}): ActiveChallengeViewModel {
  const { configuration, events, playbookEntries } = input;
  const currentPeriod = deriveCurrentPeriod(configuration, events);
  const latestInsight = playbookEntries.length
    ? { kind: 'known' as const, value: [...playbookEntries].sort((a, b) => b.order - a.order)[0] }
    : { kind: 'not_recorded' as const };
  const activeRecovery = playbookEntries.some((entry) => entry.recoveryStatus === 'active');
  const recoveryForCurrentEvent = currentPeriod.relevantEventId
    ? playbookEntries.find((entry) => entry.source === 'recovery' && entry.sourceEventId === currentPeriod.relevantEventId)
    : undefined;
  const completedRecoveryForCurrentEvent = recoveryForCurrentEvent?.recoveryStatus === 'completed';
  const twoFuturesState = activeRecovery ? 'recovery_active' :
    currentPeriod.status === 'lapse' ? 'lapse_recorded' :
    currentPeriod.status === 'over_limit' ? 'boundary_crossed' :
    currentPeriod.status === 'in_progress' && configuration.direction === 'cut' ? 'margin_narrowing' :
    currentPeriod.status === 'not_recorded' ? 'not_recorded' : 'promise_path';
  return {
    direction: configuration.direction,
    measurement: configuration.measurement,
    currentPeriod,
    configuredRequirement: configuration.wholeRequirement,
    configuredDuration: `${configuration.durationWeeks} weeks`,
    continuity: configuration.continuity ? { kind: 'known', value: configuration.continuity } : { kind: 'not_applicable' },
    recordedPeriods: { kind: 'unavailable', reason: 'No completed periods have been recorded in this preview.' },
    successfulPeriods: { kind: 'unavailable', reason: 'Successful periods require completed period history.' },
    remainingPeriods: { kind: 'unavailable', reason: 'Period dates have not been generated in this preview.' },
    minimumFuturePerformance: { kind: 'unavailable', reason: 'Future requirements need completed period history.' },
    successPossible: { kind: 'unavailable', reason: 'This preview does not perform authoritative final evaluation.' },
    twoFuturesState,
    consequenceState: 'preview_only_no_action',
    nextAction: deriveNextAction(configuration, currentPeriod, activeRecovery, latestInsight.kind === 'known', completedRecoveryForCurrentEvent),
    latestInsight,
    history: { currentPeriodAvailable: true, previousPeriods: { kind: 'unavailable', reason: 'Previous periods are not available in this preview.' } },
  };
}

function deriveCurrentPeriod(configuration: PreviewConfiguration, events: readonly PreviewEvent[]): CurrentPeriodView {
  if (configuration.direction === 'build') {
    const count = Math.min(events.filter((event) => event.type === 'build_completion').length, configuration.target);
    if (count === 0) return { status: 'not_recorded', recorded: { kind: 'known', value: 0 }, remaining: { kind: 'known', value: configuration.target }, headline: `0 of ${configuration.target} completed this period`, detail: `${configuration.target} more keep this period on track.`, relevantEventId: null };
    const remaining = Math.max(configuration.target - count, 0);
    return { status: remaining === 0 ? 'met' : 'in_progress', recorded: { kind: 'known', value: count }, remaining: { kind: 'known', value: remaining }, headline: `${count} of ${configuration.target} completed this period`, detail: remaining === 0 ? 'The current period target is complete.' : `${remaining} more keep this period on track.`, relevantEventId: null };
  }
  if (configuration.direction === 'cut') {
    const totals = events.filter((event): event is Extract<PreviewEvent, { type: 'cut_total' }> => event.type === 'cut_total');
    if (!totals.length) return { status: 'not_recorded', recorded: { kind: 'not_recorded' }, remaining: { kind: 'not_recorded' }, headline: 'No total recorded for this period', detail: 'Update the current total when you have something to record.', relevantEventId: null };
    const latestTotal = totals.reduce((latest, event) => event.order > latest.order ? event : latest);
    const value = latestTotal.value;
    const difference = configuration.target - value;
    const formatted = formatValue(value, configuration.unit);
    const limit = formatValue(configuration.target, configuration.unit);
    if (difference < 0) return { status: 'over_limit', recorded: { kind: 'known', value }, remaining: { kind: 'known', value: difference }, headline: `${formatted} of ${limit} used`, detail: `${formatValue(Math.abs(difference), configuration.unit)} over the current limit.`, relevantEventId: latestTotal.id };
    return { status: difference === 0 ? 'at_limit' : 'within_limit', recorded: { kind: 'known', value }, remaining: { kind: 'known', value: difference }, headline: `${formatted} of ${limit} used`, detail: difference === 0 ? 'The current limit has been reached.' : `${formatValue(difference, configuration.unit)} remain this period.`, relevantEventId: latestTotal.id };
  }
  const statuses = events.filter((event): event is Extract<PreviewEvent, { type: 'stop_status' }> => event.type === 'stop_status');
  const lapseEvent = statuses.find((event) => event.status === 'lapse');
  if (lapseEvent) return { status: 'lapse', recorded: { kind: 'known', value: 'lapse' }, remaining: { kind: 'not_applicable' }, headline: 'A lapse has been recorded', detail: 'Stop V1 remains a zero-lapse rule. Recovery does not erase this event.', relevantEventId: lapseEvent.id };
  if (statuses.some((event) => event.status === 'intact')) return { status: 'intact', recorded: { kind: 'known', value: 'intact' }, remaining: { kind: 'not_applicable' }, headline: 'Promise intact in this preview', detail: 'No lapse has been recorded in this preview session.', relevantEventId: null };
  return { status: 'not_recorded', recorded: { kind: 'not_recorded' }, remaining: { kind: 'not_applicable' }, headline: 'No status recorded yet', detail: 'Report whether the promise is still intact.', relevantEventId: null };
}

function deriveNextAction(configuration: PreviewConfiguration, period: CurrentPeriodView, activeRecovery: boolean, hasInsight: boolean, completedRecoveryForCurrentEvent: boolean): ActiveChallengeViewModel['nextAction'] {
  if (activeRecovery) return { type: 'continue_recovery', label: 'Continue recovery', detail: 'Complete the recovery action you chose.' };
  if (period.status === 'over_limit' || period.status === 'lapse') {
    if (completedRecoveryForCurrentEvent && configuration.direction === 'cut') return { type: 'update_total', label: 'Update total', detail: 'Your recovery action was completed. The over-limit total stays recorded — keep the current period total accurate.' };
    if (completedRecoveryForCurrentEvent) return { type: 'recovery_completed', label: 'Recovery noted', detail: 'Your recovery action was completed and saved to your Playbook. The lapse stays recorded and Stop V1 remains zero-lapse.' };
    return { type: 'continue_recovery', label: 'Plan recovery', detail: 'Capture what made this harder and choose the next useful action.' };
  }
  if (configuration.direction === 'build') return period.status === 'met'
    ? { type: hasInsight ? 'review_playbook' : 'period_complete', label: hasInsight ? 'Review Playbook' : 'Period target complete', detail: hasInsight ? 'A strategy you recorded may help with what comes next.' : 'No further completion is required in this preview period.' }
    : { type: 'check_in', label: 'Check in', detail: 'Record another completed behavior instance.' };
  if (configuration.direction === 'cut') return { type: 'update_total', label: 'Update total', detail: 'Keep the current period total accurate.' };
  return { type: 'report_status', label: 'Report status', detail: 'Confirm whether the promise is still intact.' };
}

export function isValidCutTotal(value: number, measurement: PreviewMeasurement) {
  return Number.isFinite(value) && value >= 0 && (measurement !== 'count' || Number.isInteger(value));
}

export function capBuildCompletions(current: number, target: number) {
  return Math.min(Math.max(current, 0), target);
}

function formatValue(value: number, unit: string) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}
