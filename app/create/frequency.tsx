import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceListV2 } from '@/components/v2/choice-list';
import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { RhythmState, RhythmType, useOnboarding, Weekday } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';
import { playSelectionHaptic } from '@/lib/haptics';

const CHOICES: { label: string; value: RhythmType }[] = [
  { label: 'Every day', value: 'daily' },
  { label: 'Times per week', value: 'weekly_count' },
  { label: 'Specific days', value: 'specific_days' },
];

const WEEKDAYS: { short: string; value: Weekday }[] = [
  { short: 'M', value: 'monday' },
  { short: 'T', value: 'tuesday' },
  { short: 'W', value: 'wednesday' },
  { short: 'T', value: 'thursday' },
  { short: 'F', value: 'friday' },
  { short: 'S', value: 'saturday' },
  { short: 'S', value: 'sunday' },
];

function parsePositiveValue(rawValue: string) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function CreateFrequencyScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { behaviorDirection, rhythm, setRhythm } = useOnboarding();
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'frequency');

  const parsedValue = parsePositiveValue(rhythm.targetValue);
  const canContinue = Boolean(
    rhythm.type === 'daily' ||
      (rhythm.type === 'weekly_count' && parsedValue && Number.isInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 7) ||
      (rhythm.type === 'specific_days' && rhythm.selectedWeekdays.length > 0),
  );

  const updateRhythm = (updater: (current: RhythmState) => RhythmState) => setRhythm(updater);

  const selectType = (type: RhythmType) => {
    void playSelectionHaptic();
    updateRhythm((current) => {
      const currentValue = parsePositiveValue(current.targetValue);
      const hasValidWeeklyValue = Boolean(currentValue && Number.isInteger(currentValue) && currentValue <= 7);
      return { ...current, targetValue: type === 'weekly_count' && !hasValidWeeklyValue ? '3' : current.targetValue, type };
    });
  };

  const adjustWeeklyCount = (change: number) => {
    void playSelectionHaptic();
    const currentValue = parsePositiveValue(rhythm.targetValue) ?? 3;
    const nextValue = Math.min(7, Math.max(1, Math.round(currentValue) + change));
    updateRhythm((current) => ({ ...current, targetValue: String(nextValue) }));
  };

  const toggleWeekday = (weekday: Weekday) => {
    void playSelectionHaptic();
    updateRhythm((current) => ({
      ...current,
      selectedWeekdays: current.selectedWeekdays.includes(weekday)
        ? current.selectedWeekdays.filter((day) => day !== weekday)
        : [...current.selectedWeekdays, weekday],
    }));
  };

  const continueToDuration = () => {
    if (!canContinue) return;
    router.push('/create/duration');
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to your behavior"
      currentStep={currentStep}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to duration' : 'Choose how often before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToDuration}
          reducedMotion={reducedMotion}
        />
      }
      headline="How often?"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: frequency`}
      totalSteps={totalSteps}
    >
      <ChoiceListV2 layout="row" onChange={selectType} options={CHOICES} value={rhythm.type} />

      {rhythm.type === 'weekly_count' && (
        <View style={styles.stepper}>
          <Pressable accessibilityLabel="Decrease" accessibilityRole="button" hitSlop={5} onPress={() => adjustWeeklyCount(-1)} style={styles.stepperAction}>
            <Text aria-hidden style={styles.stepperSymbol}>−</Text>
          </Pressable>
          <View style={styles.stepperValue}>
            <Text style={styles.stepperNumber}>{rhythm.targetValue || '3'}</Text>
            <Text style={styles.stepperUnit}>PER WEEK</Text>
          </View>
          <Pressable accessibilityLabel="Increase" accessibilityRole="button" hitSlop={5} onPress={() => adjustWeeklyCount(1)} style={styles.stepperAction}>
            <Text aria-hidden style={styles.stepperSymbol}>＋</Text>
          </Pressable>
        </View>
      )}

      {rhythm.type === 'specific_days' && (
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((weekday) => {
            const selected = rhythm.selectedWeekdays.includes(weekday.value);
            return (
              <Pressable
                accessibilityHint="Toggles this active day"
                accessibilityLabel={weekday.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={weekday.value}
                onPress={() => toggleWeekday(weekday.value)}
                style={[styles.weekday, selected && styles.weekdaySelected]}
              >
                <Text style={[styles.weekdayLabel, selected && styles.weekdayLabelSelected]}>{weekday.short}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  stepper: {
    minHeight: 68, flexDirection: 'row', borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  stepperAction: { width: 64, alignItems: 'center', justifyContent: 'center' },
  stepperSymbol: { color: theme.colors.ivory, fontSize: 24, fontWeight: '300' },
  stepperValue: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.colors.structureLine,
  },
  stepperNumber: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700' },
  stepperUnit: { marginTop: 2, color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: {
    width: 40, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface,
  },
  weekdaySelected: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep },
  weekdayLabel: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '700' },
  weekdayLabelSelected: { color: theme.colors.ivory },
});
