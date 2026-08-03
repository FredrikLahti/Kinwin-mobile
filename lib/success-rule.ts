import type {
  BehaviorDirection,
  MeasurementMode,
  RhythmState,
} from '@/contexts/onboarding-context';
import { deriveStructuredSuccessRule } from '@/domain/challenge/success-rule';

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

  if (!unit || !rhythm.period) return null;
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
  const structured = deriveStructuredSuccessRule({
    direction: behaviorDirection,
    measurement: measurementMode,
    durationWeeks,
    rhythm,
  });
  if (!structured) return null;

  if (structured.successRule.direction === 'build') {
    const success = structured.successRule;
    if (structured.challengeRule.direction === 'build' && structured.challengeRule.rhythm.type === 'daily') {

      return {
        challengeSummary: `${behavior} · Every day · ${duration}`,
        continuity: 'Never miss more than 2 days in a row.',
        explanation: 'Built for consistency, not perfection.',
        explanationDetail: 'A few difficult periods are allowed, but long gaps are not.',
        isStopRule: false,
        overall: `Keep your promise on at least ${success.minimumRequiredCompletions} of ${success.totalPlannedCompletions} days.`,
      };
    }

    const weeklyTarget = success.periodTarget;
    const rhythmSummary = structured.challengeRule.direction === 'build' && structured.challengeRule.rhythm.type === 'specific_days'
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
      overall: `Complete at least ${success.minimumRequiredCompletions} of ${success.totalPlannedCompletions} planned sessions.`,
    };
  }

  if (structured.successRule.direction === 'cut_back') {
    const boundary = formatCutBoundary(structured.successRule.measurementType, rhythm);
    if (!boundary || !rhythm.period) return null;

    if (rhythm.period === 'day') {
      return {
        challengeSummary: `${behavior} · ${boundary} · ${duration}`,
        continuity: 'Never go over the limit more than 2 days in a row.',
        explanation: 'Built for consistency, not perfection.',
        explanationDetail: 'A few difficult periods are allowed, but long gaps are not.',
        isStopRule: false,
        overall: `Stay within your limit on at least ${structured.successRule.minimumPeriodsWithinLimit} of ${structured.successRule.totalPeriods} days.`,
      };
    }

    return {
      challengeSummary: `${behavior} · ${boundary} · ${duration}`,
      continuity: 'Never go over the limit two weeks in a row.',
      explanation: 'Built for consistency, not perfection.',
      explanationDetail: 'A few difficult periods are allowed, but long gaps are not.',
      isStopRule: false,
      overall: `Stay within your limit for at least ${structured.successRule.minimumPeriodsWithinLimit} of ${structured.successRule.totalPeriods} weeks.`,
    };
  }

  if (structured.successRule.direction === 'stop') {
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
