import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';

const MAX_LENGTH = 100;

export default function CreateBuildScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { behaviorDirection, behaviorText, setBehaviorText, setDefinitionText, setMeasurementMode } = useOnboarding();
  const [focused, setFocused] = useState(false);
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'rule');

  // Build's completion definition (still required server-side — see
  // domain/challenge/from-onboarding-draft.ts) is derived from the behavior
  // itself rather than asked as its own question: for a Build habit, "what
  // will you do" already states the threshold clearly enough ("Walk for at
  // least 20 minutes" already says what counts).
  useEffect(() => {
    setMeasurementMode('completion');
    setDefinitionText(behaviorText.trim());
  }, [behaviorText, setDefinitionText, setMeasurementMode]);

  const canContinue = behaviorText.trim().length >= 3;

  const continueToFrequency = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    router.push('/create/frequency');
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to challenge type"
      currentStep={currentStep}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to frequency' : 'Describe what you will do before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToFrequency}
          reducedMotion={reducedMotion}
        />
      }
      headline="What will you do?"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: behavior`}
      totalSteps={totalSteps}
    >
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInputV2
          accessibilityLabel="What will you do?"
          autoCapitalize="sentences"
          autoFocus
          maxLength={MAX_LENGTH}
          onBlur={() => setFocused(false)}
          onChangeText={setBehaviorText}
          onFocus={() => setFocused(true)}
          placeholder="Walk for at least 20 minutes"
          placeholderTextColor={theme.colors.warmGrey}
          selectionColor={theme.colors.oxblood}
          style={styles.input}
          value={behaviorText}
        />
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
});
