import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';
import { playSelectionHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';

const PRIMARY_DURATIONS = [2, 4, 6, 8] as const;

const BACK_HINT: Record<'build' | 'cut' | 'stop', string> = {
  build: 'Returns to frequency',
  cut: 'Returns to your limit',
  stop: 'Returns to what you are avoiding',
};

export default function CreateDurationScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const { behaviorDirection, durationWeeks, setDurationWeeks } = onboarding;
  const [customOpen, setCustomOpen] = useState(
    Boolean(durationWeeks && !PRIMARY_DURATIONS.includes(durationWeeks as never)),
  );
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'duration');

  const rule = calculateSuccessRule(onboarding);
  const durationIsValid = Boolean(durationWeeks && Number.isInteger(durationWeeks) && durationWeeks >= 2 && durationWeeks <= 12);
  const canContinue = durationIsValid && Boolean(rule);

  const selectDuration = (duration: number) => {
    void playSelectionHaptic();
    setCustomOpen(false);
    setDurationWeeks(duration);
  };

  const chooseCustomDuration = () => {
    void playSelectionHaptic();
    if (customOpen) {
      setCustomOpen(false);
      return;
    }
    setCustomOpen(true);
    setDurationWeeks((current) => (current && !PRIMARY_DURATIONS.includes(current as never) ? Math.max(2, Math.min(12, current)) : 5));
  };

  const adjustCustomDuration = (change: number) => {
    if (!durationWeeks) return;
    const nextDuration = Math.max(2, Math.min(12, durationWeeks + change));
    if (nextDuration === durationWeeks) return;
    void playSelectionHaptic();
    setDurationWeeks(nextDuration);
  };

  const continueToSuccessMeans = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    router.push('/create/success-means');
  };

  return (
    <CreateFlowScreenV2
      backHint={behaviorDirection ? BACK_HINT[behaviorDirection] : 'Returns to the previous step'}
      currentStep={currentStep}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to what success means' : 'Choose a duration from 2 to 12 weeks before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToSuccessMeans}
          reducedMotion={reducedMotion}
        />
      }
      headline="For how long?"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: duration`}
      totalSteps={totalSteps}
    >
      <View style={styles.durationRow}>
        {PRIMARY_DURATIONS.map((duration) => {
          const selected = !customOpen && durationWeeks === duration;
          return (
            <Pressable
              accessibilityLabel={`${duration} weeks`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={duration}
              onPress={() => selectDuration(duration)}
              style={[styles.durationChoice, selected && styles.durationChoiceSelected]}
            >
              <Text style={[styles.durationNumber, selected && styles.durationNumberSelected]}>{duration}</Text>
              <Text style={[styles.durationUnit, selected && styles.durationUnitSelected]}>WEEKS</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityHint="Reveals a duration control from 2 to 12 weeks"
        accessibilityRole="button"
        accessibilityState={{ expanded: customOpen }}
        onPress={chooseCustomDuration}
        style={[styles.customAction, customOpen && styles.customActionOpen]}
      >
        <Text style={styles.customActionText}>Choose another length</Text>
        <Text aria-hidden style={styles.customActionSymbol}>{customOpen ? '−' : '+'}</Text>
      </Pressable>

      {customOpen && durationWeeks && (
        <View style={styles.customControl}>
          <Pressable
            accessibilityLabel="Decrease custom duration"
            accessibilityRole="button"
            accessibilityState={{ disabled: durationWeeks <= 2 }}
            disabled={durationWeeks <= 2}
            onPress={() => adjustCustomDuration(-1)}
            style={[styles.customControlAction, durationWeeks <= 2 && styles.disabledControl]}
          >
            <Text aria-hidden style={styles.customControlSymbol}>−</Text>
          </Pressable>
          <View style={styles.customValue}>
            <Text style={styles.customNumber}>{durationWeeks}</Text>
            <Text style={styles.customUnit}>weeks</Text>
          </View>
          <Pressable
            accessibilityLabel="Increase custom duration"
            accessibilityRole="button"
            accessibilityState={{ disabled: durationWeeks >= 12 }}
            disabled={durationWeeks >= 12}
            onPress={() => adjustCustomDuration(1)}
            style={[styles.customControlAction, durationWeeks >= 12 && styles.disabledControl]}
          >
            <Text aria-hidden style={styles.customControlSymbol}>＋</Text>
          </Pressable>
        </View>
      )}
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  durationRow: { flexDirection: 'row', gap: 8 },
  durationChoice: {
    flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface,
  },
  durationChoiceSelected: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep },
  durationNumber: { color: theme.colors.ivoryMuted, fontSize: 24, fontWeight: '700' },
  durationNumberSelected: { color: theme.colors.ivory },
  durationUnit: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  durationUnitSelected: { color: theme.colors.ivory },
  customAction: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 16,
  },
  customActionOpen: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.surface },
  customActionText: { color: theme.colors.ivoryMuted, fontSize: 14, fontWeight: '600' },
  customActionSymbol: { color: theme.colors.ivory, fontSize: 20 },
  customControl: {
    minHeight: 66, flexDirection: 'row', borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surfaceRaised, overflow: 'hidden',
  },
  customControlAction: { width: 64, alignItems: 'center', justifyContent: 'center' },
  customControlSymbol: { color: theme.colors.ivory, fontSize: 22, fontWeight: '300' },
  customValue: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.colors.structureLine,
  },
  customNumber: { color: theme.colors.ivory, fontSize: 24, fontWeight: '700' },
  customUnit: { color: theme.colors.ivoryMuted, fontSize: 13 },
  disabledControl: { opacity: 0.35 },
});
