import { BehaviorDirection, MeasurementMode, RhythmState, Weekday } from '@/contexts/onboarding-context';

const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text;
}

function joinWeekdays(days: readonly Weekday[]): string {
  const labels = days.map((day) => WEEKDAY_LABELS[day]);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

function describeUnit(measurementMode: MeasurementMode | null, rhythm: RhythmState): string | null {
  if (measurementMode === 'count') return 'times';
  if (measurementMode === 'time') return rhythm.timeUnit;
  if (measurementMode === 'amount') return rhythm.amountUnit.trim() || null;
  return null;
}

export type ChallengeRuleSummaryInput = {
  readonly behaviorDirection: BehaviorDirection | null;
  readonly behaviorText: string;
  readonly measurementMode: MeasurementMode | null;
  readonly rhythm: RhythmState;
};

// A plain restatement of the rule for the user to read back — "Walk for at
// least 20 minutes, 3 times per week" / "Social media: maximum 3 hours per
// week" / "No smoking" — distinct from lib/success-rule.ts's
// calculateSuccessRule, which describes the statistical success threshold
// ("Complete at least 10 of 14 planned sessions"), not the rule itself.
export function describeChallengeRule({
  behaviorDirection,
  behaviorText,
  measurementMode,
  rhythm,
}: ChallengeRuleSummaryInput): string {
  const behavior = behaviorText.trim();
  if (!behavior) return '';

  if (behaviorDirection === 'stop') return `No ${lowerFirst(behavior)}`;

  if (behaviorDirection === 'cut') {
    const unit = describeUnit(measurementMode, rhythm);
    const targetValue = rhythm.targetValue.trim();
    if (!unit || !rhythm.period || !targetValue) return behavior;
    return `${behavior}: maximum ${targetValue} ${unit} per ${rhythm.period}`;
  }

  if (behaviorDirection === 'build') {
    if (rhythm.type === 'daily') return `${behavior}, every day`;
    if (rhythm.type === 'weekly_count' && rhythm.targetValue.trim()) {
      const count = Number(rhythm.targetValue);
      if (Number.isFinite(count) && count > 0) return `${behavior}, ${count} ${count === 1 ? 'time' : 'times'} per week`;
    }
    if (rhythm.type === 'specific_days' && rhythm.selectedWeekdays.length > 0) {
      return `${behavior}, ${joinWeekdays(rhythm.selectedWeekdays)}`;
    }
    return behavior;
  }

  return behavior;
}
