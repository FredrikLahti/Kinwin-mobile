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

const DIRECTIONS: { label: string; value: BehaviorDirection }[] = [
  { label: 'Build', value: 'build' },
  { label: 'Reduce', value: 'cut' },
  { label: 'Stop', value: 'stop' },
];

const BEHAVIOR_PLACEHOLDER: Record<BehaviorDirection, string> = {
  build: 'Strength train 3x a week',
  cut: 'Time on social media',
  stop: 'Vaping',
};

const MEASUREMENT_CHOICES: { label: string; value: MeasurementMode }[] = [
  { label: 'Times', value: 'count' },
  { label: 'Time spent', value: 'time' },
  { label: 'Amount', value: 'amount' },
];

const DEFINITION_TITLES: Record<MeasurementMode, string> = {
  completion: 'What counts as done?',
  count: 'What counts as one time?',
  time: 'What should be timed?',
  amount: 'What are you tracking?',
  abstinence: 'What counts as a lapse?',
};

const DEFINITION_PLACEHOLDER: Record<MeasurementMode, string> = {
  completion: 'At least 30 minutes of strength training',
  count: 'One check-in message sent',
  time: 'Time spent on social apps',
  amount: 'Cigarettes, drinks, dollars…',
  abstinence: 'Any use of a nicotine vape',
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

  const hasValidMode = Boolean(
    (behaviorDirection === 'build' && measurementMode === 'completion') ||
      (behaviorDirection === 'stop' && measurementMode === 'abstinence') ||
      (behaviorDirection === 'cut' && measurementMode && CUT_MODES.includes(measurementMode)),
  );
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
      headline="What will you do?"
      onBack={() => router.back()}
      progressLabel="Step 2 of 7: promise"
      totalSteps={7}
    >
      <ChoiceListV2
        layout="row"
        onChange={setBehaviorDirection}
        options={DIRECTIONS}
        value={behaviorDirection}
      />

      {behaviorDirection && (
        <View style={[styles.field, focusedField === 'behavior' && styles.fieldFocused]}>
          <Text style={styles.fieldCaption}>Your promise</Text>
          <TextInput
            accessibilityLabel="Your promise"
            autoCapitalize="sentences"
            autoFocus
            maxLength={BEHAVIOR_MAX_LENGTH}
            onBlur={() => setFocusedField(null)}
            onChangeText={setBehaviorText}
            onFocus={() => setFocusedField('behavior')}
            placeholder={BEHAVIOR_PLACEHOLDER[behaviorDirection]}
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.crimsonBright}
            style={styles.input}
            value={behaviorText}
          />
        </View>
      )}

      {behaviorDirection === 'cut' && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>How do you want to measure it?</Text>
          <ChoiceListV2 onChange={setMeasurementMode} options={MEASUREMENT_CHOICES} value={measurementMode} />
        </View>
      )}

      {hasValidMode && measurementMode && (
        <View style={[styles.field, focusedField === 'definition' && styles.fieldFocused]}>
          <Text style={styles.fieldCaption}>{DEFINITION_TITLES[measurementMode]}</Text>
          <TextInput
            accessibilityLabel={DEFINITION_TITLES[measurementMode]}
            autoCapitalize="sentences"
            maxLength={DEFINITION_MAX_LENGTH}
            onBlur={() => setFocusedField(null)}
            onChangeText={setDefinitionText}
            onFocus={() => setFocusedField('definition')}
            placeholder={DEFINITION_PLACEHOLDER[measurementMode]}
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.crimsonBright}
            style={styles.input}
            value={definitionText}
          />
        </View>
      )}
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 64, justifyContent: 'center', borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  fieldFocused: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.surfaceRaised },
  fieldCaption: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  input: { marginTop: 4, color: theme.colors.ivory, fontSize: 19, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  section: { gap: 10 },
  sectionLabel: { color: theme.colors.ivoryMuted, fontSize: 14, fontWeight: '600' },
});
