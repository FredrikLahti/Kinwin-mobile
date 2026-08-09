import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceListV2 } from '@/components/v2/choice-list';
import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { BehaviorDirection, MeasurementMode, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const BEHAVIOR_MAX_LENGTH = 100;
const DEFINITION_MAX_LENGTH = 140;
const CUT_MODES: MeasurementMode[] = ['count', 'time', 'amount'];

const DIRECTIONS: { description: string; label: string; value: BehaviorDirection }[] = [
  { description: 'Do more of a behavior that helps you.', label: 'Build something good', value: 'build' },
  { description: 'Keep a behavior within a clear boundary.', label: 'Cut something back', value: 'cut' },
  { description: 'Remove a behavior entirely.', label: 'Stop something completely', value: 'stop' },
];

const INPUT_CONTENT: Record<BehaviorDirection, { label: string; placeholder: string }> = {
  build: { label: 'I will…', placeholder: 'Strength train' },
  cut: { label: 'I will limit…', placeholder: 'Social media' },
  stop: { label: 'I will stop…', placeholder: 'Vaping' },
};

const MEASUREMENT_CHOICES: { description: string; label: string; value: MeasurementMode }[] = [
  { description: 'Each separate time it happens.', label: 'Times', value: 'count' },
  { description: 'The total minutes or hours.', label: 'Time spent', value: 'time' },
  { description: 'A quantity such as puffs, pods, servings, items, or money.', label: 'Amount', value: 'amount' },
];

const DEFINITION_CONTENT: Record<MeasurementMode, { helper: string; label: string; placeholder: string }> = {
  completion: {
    helper: 'Describe the minimum that makes one session count.',
    label: 'One completion means…',
    placeholder: 'At least 30 minutes of strength training',
  },
  count: {
    helper: 'Define where one occurrence ends and another begins.',
    label: 'One time means…',
    placeholder: 'Describe one separate time it happens',
  },
  time: {
    helper: 'The exact time limit and period come next.',
    label: 'The time I’ll track is…',
    placeholder: 'Describe what activity should be timed',
  },
  amount: {
    helper: 'Choose the quantity that makes sense. The exact limit and period come next.',
    label: 'The amount I’ll track is…',
    placeholder: 'Puffs, pods, items, SEK…',
  },
  abstinence: {
    helper: 'Be specific about what would count as breaking the promise.',
    label: 'A lapse means…',
    placeholder: 'Any use of a nicotine vape',
  },
};

export default function CreatePromiseScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const {
    behaviorDirection,
    behaviorText,
    definitionText,
    measurementMode,
    setBehaviorDirection,
    setBehaviorText,
    setDefinitionText,
    setMeasurementMode,
  } = useOnboarding();
  const [focusedField, setFocusedField] = useState<'behavior' | 'definition' | null>(null);

  useEffect(() => {
    let nextMode: MeasurementMode | null = null;
    if (behaviorDirection === 'build') nextMode = 'completion';
    else if (behaviorDirection === 'stop') nextMode = 'abstinence';
    else if (behaviorDirection === 'cut' && measurementMode && CUT_MODES.includes(measurementMode)) {
      nextMode = measurementMode;
    }
    if (measurementMode !== nextMode) setMeasurementMode(nextMode);
  }, [behaviorDirection, measurementMode, setMeasurementMode]);

  const inputContent = behaviorDirection ? INPUT_CONTENT[behaviorDirection] : null;
  const hasValidMode = Boolean(
    (behaviorDirection === 'build' && measurementMode === 'completion') ||
      (behaviorDirection === 'stop' && measurementMode === 'abstinence') ||
      (behaviorDirection === 'cut' && measurementMode && CUT_MODES.includes(measurementMode)),
  );
  const definitionContent = measurementMode ? DEFINITION_CONTENT[measurementMode] : null;
  const canContinue = Boolean(
    behaviorDirection && behaviorText.trim().length >= 3 && hasValidMode && definitionText.trim().length >= 3,
  );

  const continueToRhythm = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    router.push('/create/rhythm');
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to your goal"
      currentStep={2}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to rhythm' : 'Choose a direction and describe your promise before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToRhythm}
          reducedMotion={reducedMotion}
        />
      }
      headline="What will you promise?"
      onBack={() => router.back()}
      progressLabel="Step 2 of 7: promise"
      supportingCopy="Your goal is the reason. Now choose a behavior you can control and define exactly what counts."
      totalSteps={7}
    >
      <ChoiceListV2
        layout="row"
        onChange={setBehaviorDirection}
        options={DIRECTIONS}
        value={behaviorDirection}
      />

      {behaviorDirection && inputContent && (
        <View style={[styles.field, focusedField === 'behavior' && styles.fieldFocused]}>
          <Text style={styles.fieldLabel}>{inputContent.label}</Text>
          <TextInput
            accessibilityLabel={inputContent.label}
            autoCapitalize="sentences"
            maxLength={BEHAVIOR_MAX_LENGTH}
            onBlur={() => setFocusedField(null)}
            onChangeText={setBehaviorText}
            onFocus={() => setFocusedField('behavior')}
            placeholder={inputContent.placeholder}
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.crimsonBright}
            style={styles.input}
            value={behaviorText}
          />
        </View>
      )}

      {behaviorDirection === 'cut' && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>How should this be measured?</Text>
          <ChoiceListV2 onChange={setMeasurementMode} options={MEASUREMENT_CHOICES} value={measurementMode} />
        </View>
      )}

      {definitionContent && hasValidMode && (
        <View style={[styles.field, focusedField === 'definition' && styles.fieldFocused]}>
          <Text style={styles.fieldLabel}>{definitionContent.label}</Text>
          <TextInput
            accessibilityLabel={definitionContent.label}
            autoCapitalize="sentences"
            maxLength={DEFINITION_MAX_LENGTH}
            multiline
            onBlur={() => setFocusedField(null)}
            onChangeText={setDefinitionText}
            onFocus={() => setFocusedField('definition')}
            placeholder={definitionContent.placeholder}
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.crimsonBright}
            style={[styles.input, styles.multilineInput]}
            textAlignVertical="top"
            value={definitionText}
          />
          <Text style={styles.helper}>{definitionContent.helper}</Text>
        </View>
      )}
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  field: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12,
  },
  fieldFocused: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.surfaceRaised },
  fieldLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '600' },
  input: { marginTop: 8, minHeight: 30, color: theme.colors.ivory, fontSize: 19, paddingHorizontal: 0, paddingVertical: 0 },
  multilineInput: { minHeight: 60 },
  helper: { marginTop: 8, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  section: { gap: 10 },
  sectionLabel: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600' },
});
