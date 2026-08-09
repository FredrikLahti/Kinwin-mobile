import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceListV2 } from '@/components/v2/choice-list';
import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { RhythmPeriod, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';
import { describeChallengeRule } from '@/lib/challenge-creation/summary';
import { playSelectionHaptic } from '@/lib/haptics';

type UnitPreset = 'minutes' | 'hours' | 'times' | 'items' | 'sek' | 'other';

const UNIT_PRESETS: { label: string; value: UnitPreset }[] = [
  { label: 'Minutes', value: 'minutes' },
  { label: 'Hours', value: 'hours' },
  { label: 'Times', value: 'times' },
  { label: 'Items', value: 'items' },
  { label: 'SEK', value: 'sek' },
  { label: 'Other', value: 'other' },
];

const PERIODS: { label: string; value: RhythmPeriod }[] = [
  { label: 'Per day', value: 'day' },
  { label: 'Per week', value: 'week' },
];

function presetFromContext(measurementMode: string | null, timeUnit: string | null, amountUnit: string): UnitPreset | null {
  if (measurementMode === 'time' && timeUnit === 'minutes') return 'minutes';
  if (measurementMode === 'time' && timeUnit === 'hours') return 'hours';
  if (measurementMode === 'count') return 'times';
  if (measurementMode === 'amount' && amountUnit === 'items') return 'items';
  if (measurementMode === 'amount' && amountUnit === 'SEK') return 'sek';
  if (measurementMode === 'amount' && amountUnit) return 'other';
  return null;
}

export default function CreateLimitScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const {
    behaviorDirection,
    behaviorText,
    measurementMode,
    rhythm,
    setBehaviorText,
    setDefinitionText,
    setMeasurementMode,
    setRhythm,
  } = useOnboarding();
  const [focused, setFocused] = useState(false);
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'rule');

  const preset = presetFromContext(measurementMode, rhythm.timeUnit, rhythm.amountUnit);

  useEffect(() => {
    if (rhythm.type !== 'maximum_per_period') setRhythm((current) => ({ ...current, type: 'maximum_per_period' }));
  }, [rhythm.type, setRhythm]);

  // The completion definition (still required server-side) is derived
  // directly from the limit itself rather than asked separately.
  useEffect(() => {
    const summary = describeChallengeRule({ behaviorDirection, behaviorText, measurementMode, rhythm });
    if (summary) setDefinitionText(summary);
  }, [behaviorDirection, behaviorText, measurementMode, rhythm, setDefinitionText]);

  const selectPreset = (next: UnitPreset) => {
    void playSelectionHaptic();
    if (next === 'minutes') { setMeasurementMode('time'); setRhythm((current) => ({ ...current, timeUnit: 'minutes' })); }
    else if (next === 'hours') { setMeasurementMode('time'); setRhythm((current) => ({ ...current, timeUnit: 'hours' })); }
    else if (next === 'times') { setMeasurementMode('count'); }
    else if (next === 'items') { setMeasurementMode('amount'); setRhythm((current) => ({ ...current, amountUnit: 'items' })); }
    else if (next === 'sek') { setMeasurementMode('amount'); setRhythm((current) => ({ ...current, amountUnit: 'SEK' })); }
    else { setMeasurementMode('amount'); setRhythm((current) => ({ ...current, amountUnit: current.amountUnit === 'items' || current.amountUnit === 'SEK' ? '' : current.amountUnit })); }
  };

  const selectPeriod = (period: RhythmPeriod) => {
    void playSelectionHaptic();
    setRhythm((current) => ({ ...current, period }));
  };

  const updateLimitValue = (value: string) => {
    if (!/^\d*$/.test(value)) return;
    setRhythm((current) => ({ ...current, targetValue: value }));
  };

  const updateCustomUnit = (value: string) => {
    setRhythm((current) => ({ ...current, amountUnit: value }));
  };

  const canContinue = Boolean(
    behaviorText.trim().length >= 3 && preset && rhythm.period && rhythm.targetValue.trim()
      && Number(rhythm.targetValue) > 0 && (preset !== 'other' || rhythm.amountUnit.trim()),
  );

  const continueToDuration = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    router.push('/create/duration');
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to challenge type"
      currentStep={currentStep}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to duration' : 'Set what to limit and your limit before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToDuration}
          reducedMotion={reducedMotion}
        />
      }
      headline="What do you want to limit?"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: limit`}
      totalSteps={totalSteps}
    >
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInput
          accessibilityLabel="What do you want to limit?"
          autoCapitalize="sentences"
          autoFocus
          maxLength={60}
          onBlur={() => setFocused(false)}
          onChangeText={setBehaviorText}
          onFocus={() => setFocused(true)}
          placeholder="Social media"
          placeholderTextColor={theme.colors.warmGrey}
          selectionColor={theme.colors.oxblood}
          style={styles.input}
          value={behaviorText}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SET YOUR LIMIT</Text>
        <View style={styles.ruleRow}>
          <TextInput
            accessibilityLabel="Limit amount"
            keyboardType="number-pad"
            maxLength={5}
            onChangeText={updateLimitValue}
            placeholder="0"
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.oxblood}
            style={styles.amountInput}
            value={rhythm.targetValue}
          />
        </View>
        <View style={styles.unitRow}>
          {UNIT_PRESETS.map((option) => {
            const selected = preset === option.value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={option.value}
                onPress={() => selectPreset(option.value)}
                style={[styles.unitChip, selected && styles.unitChipSelected]}
              >
                <Text style={[styles.unitChipText, selected && styles.unitChipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {preset === 'other' && (
          <TextInput
            accessibilityLabel="Custom unit"
            autoCapitalize="none"
            maxLength={20}
            onChangeText={updateCustomUnit}
            placeholder="Unit (e.g. cigarettes, drinks)"
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.oxblood}
            style={styles.customUnitInput}
            value={rhythm.amountUnit === 'items' || rhythm.amountUnit === 'SEK' ? '' : rhythm.amountUnit}
          />
        )}
        <ChoiceListV2 layout="row" onChange={selectPeriod} options={PERIODS} value={rhythm.period} />
      </View>
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 64, justifyContent: 'center', borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  fieldFocused: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.surfaceRaised },
  input: { color: theme.colors.ivory, fontSize: 19, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  section: { gap: 12 },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  ruleRow: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 18, paddingVertical: 6,
  },
  amountInput: { minHeight: 52, color: theme.colors.ivory, fontSize: 32, fontWeight: '700', paddingHorizontal: 0, paddingVertical: 0 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitChip: {
    minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1,
    borderColor: theme.colors.structureLineStrong, paddingHorizontal: 14,
  },
  unitChipSelected: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep },
  unitChipText: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600' },
  unitChipTextSelected: { color: theme.colors.ivory },
  customUnitInput: {
    minHeight: 46, borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.oxblood,
    backgroundColor: theme.colors.surfaceRaised, color: theme.colors.ivory, fontSize: 15,
    paddingHorizontal: 16, paddingVertical: 0,
  },
});
