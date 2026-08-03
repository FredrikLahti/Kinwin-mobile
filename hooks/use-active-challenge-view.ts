import { useChallengePreview } from '@/contexts/challenge-preview-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { buildActiveChallengeViewModel, PreviewConfiguration } from '@/lib/challenge-preview-view-model';
import { calculateSuccessRule } from '@/lib/success-rule';
export function useActiveChallengeView() {
  const onboarding = useOnboarding(); const preview = useChallengePreview(); const success = calculateSuccessRule(onboarding);
  const { behaviorDirection, measurementMode, rhythm, durationWeeks } = onboarding;
  const target = behaviorDirection === 'build' ? rhythm.type === 'weekly_count' ? Number(rhythm.targetValue) : rhythm.type === 'specific_days' ? rhythm.selectedWeekdays.length : 1 : behaviorDirection === 'cut' ? Number(rhythm.targetValue) : 0;
  const unit = measurementMode === 'time' ? rhythm.timeUnit ?? '' : measurementMode === 'amount' ? rhythm.amountUnit.trim() : measurementMode === 'count' ? 'times' : measurementMode === 'completion' ? 'completions' : 'lapses';
  const configuration: PreviewConfiguration | null = behaviorDirection && measurementMode && durationWeeks && success ? { direction: behaviorDirection, measurement: measurementMode, target, periodUnit: behaviorDirection === 'stop' ? 'challenge' : rhythm.period ?? (rhythm.type === 'daily' ? 'day' : 'week'), unit, durationWeeks, wholeRequirement: success.overall, continuity: success.continuity } : null;
  const view = configuration ? buildActiveChallengeViewModel({ configuration, events: preview.events, playbookEntries: preview.playbookEntries }) : null;
  return { onboarding, preview, configuration, view, success };
}
