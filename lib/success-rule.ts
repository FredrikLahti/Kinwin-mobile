import {
  BehaviorDirection,
  MeasurementMode,
  RhythmState,
} from '@/contexts/onboarding-context';

type SuccessRuleInput = {
  behaviorDirection: BehaviorDirection | null;
  behaviorText: string;
  definitionText: string;
  durationWeeks: number | null;
  goal: string;
  measurementMode: MeasurementMode | null;
  rhythm: RhythmState;
};

export type SuccessRule = {
  challengeSummary: string;
  continuity: string | null;
  explanation: string;
  explanationDetail: string | null;
  isStopRule: boolean;
  overall: string;
};

function parsePositiveValue(rawValue: string) {
  const parsed = Number(rawValue.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatDuration(durationWeeks: number) {
  return `${durationWeeks} ${durationWeeks === 1 ? 'week' : 'weeks'}`;
}

function formatCutBoundary(measurementMode: MeasurementMode, rhythm: RhythmState) {
  const unit =
    measurementMode === 'count'
      ? 'times'
      : measurementMode === 'time'
        ? rhythm.timeUnit
        : rhythm.amountUnit.trim();

  if (!unit || !rhythm.period || !parsePositiveValue(rhythm.targetValue)) return null;
  return `Maximum ${rhythm.targetValue} ${unit} per ${rhythm.period}`;
}

export function calculateSuccessRule({
  behaviorDirection,
  behaviorText,
  definitionText,
  durationWeeks,
  goal,
  measurementMode,
  rhythm,
}: SuccessRuleInput): SuccessRule | null {
  const behavior = behaviorText.trim();
  const priorTextIsValid =
    goal.trim().length >= 3 && behavior.length >= 3 && definitionText.trim().length >= 3;
  const durationIsValid = Boolean(
    durationWeeks && Number.isInteger(durationWeeks) && durationWeeks >= 2 && durationWeeks <= 12,
  );

  if (!priorTextIsValid || !durationIsValid || !durationWeeks) return null;

  const duration = formatDuration(durationWeeks);

  if (behaviorDirection === 'build' && measurementMode === 'completion') {
    if (rhythm.type === 'daily') {
      const totalActiveDays = durationWeeks * 7;
      const allowedMisses = Math.max(1, Math.round(totalActiveDays * 0.1));
      const requiredDays = totalActiveDays - allowedMisses;

      return {
        challengeSummary: `${behavior} · Every day · ${duration}`,
        continuity: 'Never miss more than 2 days in a row.',
        explanation: 'Built for consistency, not perfection.',
        explanationDetail: 'A few difficult periods are allowed, but long gaps are not.',
        isStopRule: false,
        overall: `Keep your promise on at least ${requiredDays} of ${totalActiveDays} days.`,
      };
    }

    const weeklyTarget =
      rhythm.type === 'weekly_count'
        ? parsePositiveValue(rhythm.targetValue)
        : rhythm.type === 'specific_days'
          ? rhythm.selectedWeekdays.length
          : null;

    if (!weeklyTarget || !Number.isInteger(weeklyTarget)) return null;

    const plannedCompletions = weeklyTarget * durationWeeks;
    const allowedMisses =
      plannedCompletions < 4
        ? 0
        : Math.max(1, Math.floor(plannedCompletions * 0.15));
    const requiredCompletions = plannedCompletions - allowedMisses;
    const rhythmSummary =
      rhythm.type === 'specific_days'
        ? `${weeklyTarget} specific ${weeklyTarget === 1 ? 'day' : 'days'} per week`
        : `${weeklyTarget} ${weeklyTarget === 1 ? 'time' : 'times'} per week`;

    return {
      challengeSummary: `${behavior} · ${rhythmSummary} · ${duration}`,
      continuity:
        weeklyTarget >= 2
          ? `Complete at least ${weeklyTarget - 1} ${weeklyTarget - 1 === 1 ? 'session' : 'sessions'} in every week.`
          : 'Do not miss two weeks in a row.',
      explanation: 'Built for consistency, not perfection.',
      explanationDetail: 'A few difficult periods are allowed, but long gaps are not.',
      isStopRule: false,
      overall: `Complete at least ${requiredCompletions} of ${plannedCompletions} planned sessions.`,
    };
  }

  if (
    behaviorDirection === 'cut' &&
    rhythm.type === 'maximum_per_period' &&
    measurementMode &&
    ['count', 'time', 'amount'].includes(measurementMode)
  ) {
    const boundary = formatCutBoundary(measurementMode, rhythm);
    if (!boundary || !rhythm.period) return null;

    if (rhythm.period === 'day') {
      const totalBoundaries = durationWeeks * 7;
      const allowedOverLimitDays = Math.max(1, Math.round(totalBoundaries * 0.1));
      const requiredWithinLimitDays = totalBoundaries - allowedOverLimitDays;

      return {
        challengeSummary: `${behavior} · ${boundary} · ${duration}`,
        continuity: 'Never go over the limit more than 2 days in a row.',
        explanation: 'Built for consistency, not perfection.',
        explanationDetail: 'A few difficult periods are allowed, but long gaps are not.',
        isStopRule: false,
        overall: `Stay within your limit on at least ${requiredWithinLimitDays} of ${totalBoundaries} days.`,
      };
    }

    const totalBoundaries = durationWeeks;
    const allowedOverLimitWeeks =
      totalBoundaries < 4 ? 0 : Math.max(1, Math.floor(totalBoundaries * 0.15));
    const requiredWithinLimitWeeks = totalBoundaries - allowedOverLimitWeeks;

    return {
      challengeSummary: `${behavior} · ${boundary} · ${duration}`,
      continuity: 'Never go over the limit two weeks in a row.',
      explanation: 'Built for consistency, not perfection.',
      explanationDetail: 'A few difficult periods are allowed, but long gaps are not.',
      isStopRule: false,
      overall: `Stay within your limit for at least ${requiredWithinLimitWeeks} of ${totalBoundaries} weeks.`,
    };
  }

  if (
    behaviorDirection === 'stop' &&
    measurementMode === 'abstinence' &&
    rhythm.type === 'continuous'
  ) {
    return {
      challengeSummary: `${behavior} · Continuous · ${duration}`,
      continuity: null,
      explanation:
        'Complete abstinence is strict by design. Go back and choose Cut something back if a flexible boundary fits better.',
      explanationDetail: null,
      isStopRule: true,
      overall: `No lapses during the full ${durationWeeks}-week challenge.`,
    };
  }

  return null;
}
