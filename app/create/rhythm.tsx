import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceListV2 } from '@/components/v2/choice-list';
import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import {
  RhythmPeriod,
  RhythmState,
  RhythmTimeUnit,
  RhythmType,
  useOnboarding,
  Weekday,
} from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playSelectionHaptic } from '@/lib/haptics';

const BUILD_RHYTHMS: { label: string; value: RhythmType }[] = [
  { label: 'Every day', value: 'daily' },
  { label: 'Times per week', value: 'weekly_count' },
  { label: 'Specific days', value: 'specific_days' },
];

const WEEKDAYS: { label: string; short: string; value: Weekday }[] = [
  { label: 'Monday', short: 'M', value: 'monday' },
  { label: 'Tuesday', short: 'T', value: 'tuesday' },
  { label: 'Wednesday', short: 'W', value: 'wednesday' },
  { label: 'Thursday', short: 'T', value: 'thursday' },
  { label: 'Friday', short: 'F', value: 'friday' },
  { label: 'Saturday', short: 'S', value: 'saturday' },
  { label: 'Sunday', short: 'S', value: 'sunday' },
];

const PERIODS: { label: string; value: RhythmPeriod }[] = [
  { label: 'Per day', value: 'day' },
  { label: 'Per week', value: 'week' },
];

const TIME_UNITS: { label: string; value: RhythmTimeUnit }[] = [
  { label: 'Minutes', value: 'minutes' },
  { label: 'Hours', value: 'hours' },
];

function parsePositiveValue(rawValue: string) {
  const parsed = Number(rawValue.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function joinWeekdays(days: Weekday[]) {
  const labels = WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.label);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

export default function CreateRhythmScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const limitInputRef = useRef<TextInput>(null);
  const { behaviorDirection, behaviorText, measurementMode, rhythm, setRhythm } = useOnboarding();

  useEffect(() => {
    setRhythm((current) => {
      if (behaviorDirection === 'stop' && current.type !== 'continuous') return { ...current, type: 'continuous' };
      if (behaviorDirection === 'cut' && current.type !== 'maximum_per_period') {
        return { ...current, type: 'maximum_per_period' };
      }
      if (behaviorDirection === 'build' && current.type && !['daily', 'weekly_count', 'specific_days'].includes(current.type)) {
        return { ...current, type: null };
      }
      return current;
    });
  }, [behaviorDirection, setRhythm]);

  const parsedValue = parsePositiveValue(rhythm.targetValue);
  const isBuildValid = Boolean(
    behaviorDirection === 'build' &&
      (rhythm.type === 'daily' ||
        (rhythm.type === 'weekly_count' && parsedValue && Number.isInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 7) ||
        (rhythm.type === 'specific_days' && rhythm.selectedWeekdays.length > 0)),
  );
  const isCutValid = Boolean(
    behaviorDirection === 'cut' &&
      rhythm.type === 'maximum_per_period' &&
      parsedValue &&
      rhythm.period &&
      (measurementMode !== 'count' || Number.isInteger(parsedValue)) &&
      (measurementMode !== 'time' || rhythm.timeUnit) &&
      (measurementMode !== 'amount' || rhythm.amountUnit.trim()),
  );
  const isStopValid = behaviorDirection === 'stop' && measurementMode === 'abstinence' && rhythm.type === 'continuous';
  const canContinue = isBuildValid || isCutValid || isStopValid;

  const updateRhythm = (updater: (current: RhythmState) => RhythmState) => setRhythm(updater);

  const selectBuildRhythm = (type: RhythmType) => {
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

  const selectPeriod = (period: RhythmPeriod) => updateRhythm((current) => ({ ...current, period }));
  const selectTimeUnit = (timeUnit: RhythmTimeUnit) => updateRhythm((current) => ({ ...current, timeUnit }));

  const updateLimit = (value: string) => {
    const pattern = measurementMode === 'count' ? /^\d*$/ : /^\d*[.,]?\d*$/;
    if (!pattern.test(value)) return;
    updateRhythm((current) => ({ ...current, targetValue: value }));
  };

  const updateAmountUnit = (amountUnit: string) => updateRhythm((current) => ({ ...current, amountUnit }));

  const continueToDuration = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    limitInputRef.current?.blur();
    router.push('/create/duration');
  };

  const behavior = behaviorText || 'Your behavior';
  let summary = '';
  if (behaviorDirection === 'build') {
    if (rhythm.type === 'daily') summary = `${behavior} every day`;
    else if (rhythm.type === 'weekly_count' && parsedValue) summary = `${behavior} ${parsedValue} ${parsedValue === 1 ? 'time' : 'times'} per week`;
    else if (rhythm.type === 'specific_days' && rhythm.selectedWeekdays.length > 0) summary = `${behavior} every ${joinWeekdays(rhythm.selectedWeekdays)}`;
  } else if (behaviorDirection === 'cut' && parsedValue && rhythm.period) {
    const unit = measurementMode === 'count' ? 'occurrences' : measurementMode === 'time' ? rhythm.timeUnit ?? '' : rhythm.amountUnit.trim();
    if (unit) summary = `${behavior}: maximum ${rhythm.targetValue} ${unit} per ${rhythm.period}`;
  } else if (behaviorDirection === 'stop') {
    summary = `${behavior}: continuous abstinence`;
  }

  return (
    <CreateFlowScreenV2
      backHint="Returns to behavior"
      currentStep={3}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to duration' : 'Complete the rhythm before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToDuration}
          reducedMotion={reducedMotion}
        />
      }
      headline="How often?"
      onBack={() => router.back()}
      progressLabel="Step 3 of 7: rhythm"
      totalSteps={7}
    >
      {behaviorDirection === 'build' && (
        <ChoiceListV2 onChange={selectBuildRhythm} options={BUILD_RHYTHMS} value={rhythm.type} />
      )}

      {behaviorDirection === 'build' && rhythm.type === 'weekly_count' && (
        <View style={styles.stepper}>
          <Pressable accessibilityLabel="Decrease completions" accessibilityRole="button" hitSlop={5} onPress={() => adjustWeeklyCount(-1)} style={styles.stepperAction}>
            <Text aria-hidden style={styles.stepperSymbol}>−</Text>
          </Pressable>
          <View style={styles.stepperValue}>
            <Text style={styles.stepperNumber}>{rhythm.targetValue || '3'}</Text>
            <Text style={styles.stepperUnit}>PER WEEK</Text>
          </View>
          <Pressable accessibilityLabel="Increase completions" accessibilityRole="button" hitSlop={5} onPress={() => adjustWeeklyCount(1)} style={styles.stepperAction}>
            <Text aria-hidden style={styles.stepperSymbol}>＋</Text>
          </Pressable>
        </View>
      )}

      {behaviorDirection === 'build' && rhythm.type === 'specific_days' && (
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((weekday) => {
            const selected = rhythm.selectedWeekdays.includes(weekday.value);
            return (
              <Pressable
                accessibilityHint="Toggles this active day"
                accessibilityLabel={weekday.label}
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

      {behaviorDirection === 'cut' && (
        <View style={styles.cutSection}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Maximum</Text>
            <View style={styles.limitRow}>
              <TextInput
                ref={limitInputRef}
                accessibilityLabel="Maximum limit"
                keyboardType={measurementMode === 'count' ? 'number-pad' : 'decimal-pad'}
                onChangeText={updateLimit}
                placeholder="0"
                placeholderTextColor={theme.colors.warmGrey}
                selectionColor={theme.colors.crimsonBright}
                style={styles.limitInput}
                value={rhythm.targetValue}
              />
              {measurementMode === 'count' && <Text style={styles.fixedUnit}>occurrences</Text>}
              {measurementMode === 'amount' && (
                <TextInput
                  accessibilityLabel="Amount unit"
                  autoCapitalize="none"
                  maxLength={20}
                  onChangeText={updateAmountUnit}
                  placeholder="SEK, servings, items…"
                  placeholderTextColor={theme.colors.warmGrey}
                  selectionColor={theme.colors.crimsonBright}
                  style={styles.unitInput}
                  value={rhythm.amountUnit}
                />
              )}
            </View>
          </View>

          {measurementMode === 'time' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Time unit</Text>
              <ChoiceListV2 layout="row" onChange={selectTimeUnit} options={TIME_UNITS} value={rhythm.timeUnit} />
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Period</Text>
            <ChoiceListV2 layout="row" onChange={selectPeriod} options={PERIODS} value={rhythm.period} />
          </View>
        </View>
      )}

      {behaviorDirection === 'stop' && (
        <View style={styles.continuousState}>
          <Text style={styles.continuousTitle}>Continuous</Text>
          <Text style={styles.continuousCopy}>
            This applies every day throughout the challenge. There are no planned off-days.
          </Text>
        </View>
      )}

      {Boolean(summary) && (
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>RHYTHM SET</Text>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      )}
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionLabel: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600' },
  stepper: {
    minHeight: 68, flexDirection: 'row', borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  stepperAction: { width: 64, alignItems: 'center', justifyContent: 'center' },
  stepperSymbol: { color: theme.colors.crimsonBright, fontSize: 24, fontWeight: '300' },
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
  weekdaySelected: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  weekdayLabel: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '700' },
  weekdayLabelSelected: { color: theme.colors.ivory },
  cutSection: { gap: 18 },
  field: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12,
  },
  fieldLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '600' },
  limitRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  limitInput: { flex: 1, minHeight: 40, color: theme.colors.ivory, fontSize: 24, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  fixedUnit: { color: theme.colors.ivoryMuted, fontSize: 14 },
  unitInput: { flex: 1, minHeight: 40, color: theme.colors.ivory, fontSize: 15, paddingHorizontal: 0, paddingVertical: 0 },
  continuousState: {
    borderRadius: theme.radius.controlled, borderLeftWidth: 2, borderLeftColor: theme.colors.crimson,
    backgroundColor: theme.colors.surface, paddingHorizontal: 18, paddingVertical: 18,
  },
  continuousTitle: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  continuousCopy: { marginTop: 8, color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  summary: {
    borderLeftWidth: 2, borderLeftColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: theme.radius.precise,
  },
  summaryLabel: { color: theme.colors.crimsonBright, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  summaryText: { marginTop: 5, color: theme.colors.ivory, fontSize: 15, lineHeight: 21 },
});
