import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playSelectionHaptic } from '@/lib/haptics';

const GOAL_MAX_LENGTH = 120;
const EXAMPLES = ['Feel stronger', 'Sleep better', 'Use my time better'] as const;

export default function CreateGoalScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { goal, setGoal } = useOnboarding();
  const [focused, setFocused] = useState(false);

  const canContinue = goal.trim().length >= 3;

  const selectExample = (example: string) => {
    void playSelectionHaptic();
    setGoal(example);
  };

  const continueToPromise = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    router.push('/create/promise');
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to Home"
      currentStep={1}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to your promise' : 'Enter a goal of at least 3 characters'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToPromise}
          reducedMotion={reducedMotion}
        />
      }
      headline="What’s your goal?"
      onBack={() => router.back()}
      progressLabel="Step 1 of 7: goal"
      totalSteps={7}
    >
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInput
          accessibilityLabel="Your goal"
          autoCapitalize="sentences"
          autoFocus
          maxLength={GOAL_MAX_LENGTH}
          onBlur={() => setFocused(false)}
          onChangeText={setGoal}
          onFocus={() => setFocused(true)}
          placeholder="Feel stronger"
          placeholderTextColor={theme.colors.warmGrey}
          selectionColor={theme.colors.crimsonBright}
          style={styles.input}
          value={goal}
        />
        {goal.length >= 100 && <Text style={styles.counter}>{goal.length}/{GOAL_MAX_LENGTH}</Text>}
      </View>

      <View style={styles.examples}>
        <Text style={styles.examplesLabel}>Try an example</Text>
        <View style={styles.exampleRow}>
          {EXAMPLES.map((example) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: goal === example }}
              key={example}
              onPress={() => selectExample(example)}
              style={({ pressed }) => [
                styles.exampleChip,
                goal === example && styles.exampleChipSelected,
                pressed && styles.exampleChipPressed,
              ]}
            >
              <Text style={[styles.exampleText, goal === example && styles.exampleTextSelected]}>{example}</Text>
            </Pressable>
          ))}
        </View>
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
  fieldFocused: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.surfaceRaised },
  input: { color: theme.colors.ivory, fontSize: 21, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  counter: { marginTop: 6, color: theme.colors.warmGrey, fontSize: 11, textAlign: 'right' },
  examples: { gap: 10 },
  examplesLabel: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  exampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exampleChip: {
    minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1,
    borderColor: theme.colors.structureLineStrong, paddingHorizontal: 14,
  },
  exampleChipSelected: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  exampleChipPressed: { backgroundColor: theme.colors.surfaceFocused },
  exampleText: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600' },
  exampleTextSelected: { color: theme.colors.ivory },
});
