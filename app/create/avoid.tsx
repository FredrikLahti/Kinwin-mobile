import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';
import { describeChallengeRule } from '@/lib/challenge-creation/summary';

export default function CreateAvoidScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const {
    behaviorDirection,
    behaviorText,
    setBehaviorText,
    setDefinitionText,
    setMeasurementMode,
    setRhythm,
  } = useOnboarding();
  const [focused, setFocused] = useState(false);
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'rule');

  useEffect(() => {
    setMeasurementMode('abstinence');
    setRhythm((current) => (current.type === 'continuous' ? current : { ...current, type: 'continuous' }));
  }, [setMeasurementMode, setRhythm]);

  const ruleSummary = describeChallengeRule({
    behaviorDirection: 'stop',
    behaviorText,
    measurementMode: 'abstinence',
    rhythm: { amountUnit: '', period: null, selectedWeekdays: [], targetValue: '', timeUnit: null, type: 'continuous' },
  });

  // No separate lapse-definition question — "No smoking" already says
  // exactly what breaks the challenge.
  useEffect(() => {
    if (ruleSummary) setDefinitionText(ruleSummary);
  }, [ruleSummary, setDefinitionText]);

  const canContinue = behaviorText.trim().length >= 3;

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
          accessibilityHint={canContinue ? 'Continues to duration' : 'Describe what to avoid before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToDuration}
          reducedMotion={reducedMotion}
        />
      }
      headline="What do you want to avoid?"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: avoid`}
      totalSteps={totalSteps}
    >
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInputV2
          accessibilityLabel="What do you want to avoid?"
          autoCapitalize="sentences"
          autoFocus
          maxLength={60}
          onBlur={() => setFocused(false)}
          onChangeText={setBehaviorText}
          onFocus={() => setFocused(true)}
          placeholder="Smoking"
          placeholderTextColor={theme.colors.warmGrey}
          selectionColor={theme.colors.oxblood}
          style={styles.input}
          value={behaviorText}
        />
      </View>
      {ruleSummary.length > 0 && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>{ruleSummary}</Text>
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
  fieldFocused: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.surfaceRaised },
  input: { color: theme.colors.ivory, fontSize: 19, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  summary: {
    borderLeftWidth: 2, borderLeftColor: theme.colors.oxblood, backgroundColor: theme.colors.surface,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: theme.radius.precise,
  },
  summaryText: { color: theme.colors.ivory, fontSize: 17, fontWeight: '700' },
});
