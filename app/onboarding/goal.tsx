import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { ExampleChoice } from '@/components/onboarding/example-choice';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { kinwinTheme as theme } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const GOAL_MAX_LENGTH = 120;
const COUNTER_THRESHOLD = 100;
const EXAMPLES = ['Feel stronger', 'Sleep better', 'Use my time better'] as const;

export default function GoalScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();
  const focusProgress = useSharedValue(0);
  const entranceProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const confirmationProgress = useSharedValue(0);
  const [goal, setGoal] = useState('');
  const [goalCaptured, setGoalCaptured] = useState(false);

  const trimmedGoal = goal.trim();
  const canContinue = trimmedGoal.length >= 3;
  const showCounter = goal.length >= COUNTER_THRESHOLD;

  const reasonSurfaceStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.structureLine, theme.colors.copper],
    ),
    backgroundColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.surfaceRaised, theme.colors.surfaceFocused],
    ),
  }));

  useEffect(() => {
    if (Platform.OS === 'web') {
      entranceProgress.value = 1;
      return;
    }
    entranceProgress.value = withTiming(1, {
      duration: reducedMotion ? 120 : theme.motion.standard,
    });
  }, [entranceProgress, reducedMotion]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      confirmationProgress.value = goalCaptured ? 1 : 0;
      return;
    }
    confirmationProgress.value = withTiming(goalCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
  }, [confirmationProgress, goalCaptured, reducedMotion]);

  const contentEntranceStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - entranceProgress.value) * 10 },
    ],
  }));

  const confirmationStyle = useAnimatedStyle(() => ({
    opacity: confirmationProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - confirmationProgress.value) * 6 },
    ],
  }));

  const updateGoal = (value: string) => {
    setGoal(value);
    if (goalCaptured) {
      setGoalCaptured(false);
    }
  };

  const selectExample = (example: (typeof EXAMPLES)[number]) => {
    void playSelectionHaptic();
    updateGoal(example);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const continueWithGoal = () => {
    if (!canContinue || goalCaptured) return;
    Keyboard.dismiss();
    inputRef.current?.blur();
    void playImportantHaptic();
    setGoalCaptured(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View
        aria-hidden
        pointerEvents="none"
        style={styles.backgroundGeometry}
      >
        <View style={styles.deepPlane} />
        <View style={styles.frameLine} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.content, contentEntranceStyle]}>
            <View style={styles.header}>
              <View style={styles.brandGroup}>
                <Pressable
                  accessibilityHint="Returns to the temporary Kinwin home screen"
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.back()}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed && styles.backButtonPressed,
                  ]}
                >
                  <Text aria-hidden style={styles.backIcon}>‹</Text>
                </Pressable>
                <Text style={styles.wordmark}>KINWIN</Text>
              </View>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.stepLabel}
              >
                1 of 6
              </Text>
            </View>

            <OnboardingProgress
              currentStep={1}
              reducedMotion={reducedMotion}
              settled={goalCaptured}
              totalSteps={6}
            />

            <View style={styles.main}>
              <View style={styles.storyBlock}>
                <View style={styles.intro}>
                  <Text style={styles.headline}>What do you want to change?</Text>
                  <Text style={styles.supportingCopy}>
                    Start with the outcome that matters to you. Next, we’ll turn it into a
                    promise you can control.
                  </Text>
                </View>

                <View style={styles.reasonStage}>
                  <View aria-hidden style={styles.reasonThread} />
                  <View aria-hidden style={styles.reasonAnchor} />
                  <View aria-hidden style={styles.reasonUnderlay} />
                  <Animated.View style={[styles.reasonSurface, reasonSurfaceStyle]}>
                    <View style={styles.reasonHeader}>
                      <Text style={styles.inputLabel}>I want to…</Text>
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={styles.anchorMark}
                      >
                        <View style={styles.anchorMarkLine} />
                        <View style={styles.anchorMarkNode} />
                      </View>
                    </View>
                    <TextInput
                      ref={inputRef}
                      accessibilityLabel="I want to"
                      autoCapitalize="sentences"
                      autoCorrect
                      maxLength={GOAL_MAX_LENGTH}
                      multiline
                      onBlur={() => {
                        focusProgress.value = withTiming(0, {
                          duration: reducedMotion ? 0 : theme.motion.quick,
                        });
                      }}
                      onChangeText={updateGoal}
                      onFocus={() => {
                        focusProgress.value = withTiming(1, {
                          duration: reducedMotion ? 0 : theme.motion.quick,
                        });
                      }}
                      placeholder="Feel stronger and more confident"
                      placeholderTextColor={theme.colors.warmGrey}
                      selectionColor={theme.colors.copperBright}
                      style={styles.input}
                      textAlignVertical="top"
                      value={goal}
                    />
                    <View style={styles.reasonFooter}>
                      <View aria-hidden style={styles.reasonStitch} />
                      {showCounter && (
                        <Text accessibilityLiveRegion="polite" style={styles.counter}>
                          {goal.length}/{GOAL_MAX_LENGTH}
                        </Text>
                      )}
                    </View>
                  </Animated.View>
                </View>
              </View>

              <View style={styles.examplesSection}>
                <View style={styles.examplesHeader}>
                  <Text style={styles.examplesLabel}>Try an example</Text>
                  <View aria-hidden style={styles.examplesRule} />
                </View>
                <View style={styles.examples}>
                  {EXAMPLES.map((example, index) => (
                    <ExampleChoice
                      key={example}
                      index={index}
                      isLast={index === EXAMPLES.length - 1}
                      label={example}
                      onPress={() => selectExample(example)}
                      reducedMotion={reducedMotion}
                      selected={goal === example}
                    />
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <View style={styles.confirmationSlot}>
                <Animated.View
                  accessibilityElementsHidden={!goalCaptured}
                  accessibilityLiveRegion="polite"
                  importantForAccessibility={goalCaptured ? 'yes' : 'no-hide-descendants'}
                  style={[styles.confirmationPanel, confirmationStyle]}
                >
                  {goalCaptured && (
                    <>
                    <View aria-hidden style={styles.confirmationNode} />
                    <Text style={styles.confirmation}>
                      Goal captured. Next, we’ll define your promise.
                    </Text>
                    </>
                  )}
                </Animated.View>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint={
                  canContinue
                    ? 'Captures this goal on the current development screen'
                    : 'Enter a meaningful goal before continuing'
                }
                disabled={!canContinue || goalCaptured}
                label="Continue"
                onPress={continueWithGoal}
                reducedMotion={reducedMotion}
              />
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.ink,
  },
  backgroundGeometry: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  deepPlane: {
    position: 'absolute',
    top: 62,
    right: 12,
    bottom: 12,
    left: 12,
    backgroundColor: theme.colors.deepInk,
    borderRadius: theme.radius.precise,
    opacity: 0.62,
  },
  frameLine: {
    position: 'absolute',
    top: 62,
    right: 12,
    bottom: 12,
    left: 12,
    borderWidth: 1,
    borderColor: theme.colors.structureLine,
    borderRadius: theme.radius.precise,
    opacity: 0.34,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 26,
    paddingTop: 6,
    paddingBottom: 18,
  },
  header: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -9,
    borderRadius: theme.radius.precise,
  },
  backButtonPressed: {
    backgroundColor: theme.colors.surface,
  },
  backIcon: {
    color: theme.colors.copperBright,
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 35,
  },
  wordmark: {
    color: theme.colors.bone,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 5,
  },
  stepLabel: {
    color: theme.colors.boneMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  main: {
    gap: 46,
    paddingTop: 22,
  },
  storyBlock: {
    position: 'relative',
  },
  intro: {
    gap: 14,
  },
  headline: {
    maxWidth: 480,
    color: theme.colors.bone,
    fontFamily: Platform.select({
      android: 'serif',
      default: 'Georgia',
      ios: 'Georgia',
      web: 'Georgia',
    }),
    fontSize: 42,
    fontWeight: '400',
    letterSpacing: -0.7,
    lineHeight: 48,
  },
  supportingCopy: {
    maxWidth: 490,
    color: theme.colors.boneMuted,
    opacity: 0.9,
    fontSize: 16,
    lineHeight: 25,
  },
  reasonStage: {
    position: 'relative',
    marginTop: 34,
    paddingHorizontal: 8,
  },
  reasonThread: {
    position: 'absolute',
    left: -26,
    right: -26,
    top: '57%',
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.62,
  },
  reasonAnchor: {
    position: 'absolute',
    left: -28,
    top: '54.5%',
    zIndex: 3,
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: theme.colors.copperBright,
    borderRadius: 5,
    backgroundColor: theme.colors.deepInk,
  },
  reasonUnderlay: {
    position: 'absolute',
    top: 7,
    right: 2,
    bottom: -7,
    left: 14,
    borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.deepInk,
  },
  reasonSurface: {
    zIndex: 2,
    minHeight: 190,
    borderWidth: 1,
    borderLeftWidth: 1.5,
    borderRadius: theme.radius.controlled,
    paddingHorizontal: 24,
    paddingTop: 23,
    paddingBottom: 18,
    shadowColor: theme.colors.deepInk,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.84,
    shadowRadius: 10,
    elevation: 8,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    color: theme.colors.copperBright,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  anchorMark: {
    width: 34,
    height: 12,
    justifyContent: 'center',
  },
  anchorMarkLine: {
    width: '100%',
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.65,
  },
  anchorMarkNode: {
    position: 'absolute',
    right: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.copperBright,
  },
  input: {
    maxHeight: 112,
    minHeight: 98,
    color: theme.colors.bone,
    fontSize: 26,
    fontWeight: '400',
    lineHeight: 34,
    paddingHorizontal: 0,
    paddingTop: 18,
    paddingBottom: 11,
  },
  reasonFooter: {
    minHeight: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  reasonStitch: {
    width: 58,
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.62,
  },
  counter: {
    color: theme.colors.warmGrey,
    fontSize: 12,
  },
  examplesSection: {
    gap: 12,
  },
  examplesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  examplesLabel: {
    color: theme.colors.copper,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  examplesRule: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.structureLine,
    opacity: 0.7,
  },
  examples: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.structureLine,
    flexDirection: 'row',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 36,
  },
  confirmationSlot: {
    minHeight: 48,
    justifyContent: 'center',
    paddingBottom: 10,
  },
  confirmationPanel: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.copper,
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 9,
  },
  confirmationNode: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.copperBright,
  },
  confirmation: {
    flex: 1,
    color: theme.colors.boneMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
