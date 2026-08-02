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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { BehaviorDirectionChoice } from '@/components/onboarding/behavior-direction-choice';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { kinwinTheme as theme } from '@/constants/theme';
import {
  BehaviorDirection,
  useOnboarding,
} from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const BEHAVIOR_MAX_LENGTH = 100;
const COUNTER_THRESHOLD = 82;

const DIRECTIONS: {
  description: string;
  label: string;
  value: BehaviorDirection;
}[] = [
  {
    description: 'Do more of a behavior that helps you.',
    label: 'Build something good',
    value: 'build',
  },
  {
    description: 'Keep a behavior within a clear boundary.',
    label: 'Cut something back',
    value: 'cut',
  },
  {
    description: 'Remove a behavior entirely.',
    label: 'Stop something completely',
    value: 'stop',
  },
];

const INPUT_CONTENT: Record<BehaviorDirection, { label: string; placeholder: string }> = {
  build: { label: 'I will…', placeholder: 'Strength train' },
  cut: { label: 'I will limit…', placeholder: 'Social media' },
  stop: { label: 'I will stop…', placeholder: 'Vaping' },
};

export default function BehaviorScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();
  const {
    behaviorDirection,
    behaviorText,
    setBehaviorDirection,
    setBehaviorText,
  } = useOnboarding();
  const [behaviorCaptured, setBehaviorCaptured] = useState(false);
  const entranceProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const surfaceProgress = useSharedValue(behaviorDirection ? 1 : 0);
  const confirmationProgress = useSharedValue(0);

  const canContinue = Boolean(
    behaviorDirection && behaviorText.trim().length >= 3,
  );
  const showCounter = behaviorText.length >= COUNTER_THRESHOLD;
  const inputContent = behaviorDirection ? INPUT_CONTENT[behaviorDirection] : null;

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
      surfaceProgress.value = behaviorDirection ? 1 : 0;
      return;
    }

    surfaceProgress.value = withTiming(behaviorDirection ? 1 : 0, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [behaviorDirection, reducedMotion, surfaceProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      confirmationProgress.value = behaviorCaptured ? 1 : 0;
      return;
    }

    confirmationProgress.value = withTiming(behaviorCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
  }, [behaviorCaptured, confirmationProgress, reducedMotion]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - entranceProgress.value) * 10 },
    ],
  }));

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: surfaceProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - surfaceProgress.value) * 8 },
    ],
  }));

  const confirmationStyle = useAnimatedStyle(() => ({
    opacity: confirmationProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - confirmationProgress.value) * 6 },
    ],
  }));

  const selectDirection = (direction: BehaviorDirection) => {
    void playSelectionHaptic();
    setBehaviorDirection(direction);
    setBehaviorCaptured(false);
  };

  const updateBehavior = (value: string) => {
    setBehaviorText(value);
    if (behaviorCaptured) {
      setBehaviorCaptured(false);
    }
  };

  const continueWithBehavior = () => {
    if (!canContinue || behaviorCaptured) return;
    Keyboard.dismiss();
    inputRef.current?.blur();
    void playImportantHaptic();
    setBehaviorCaptured(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View aria-hidden pointerEvents="none" style={styles.backgroundGeometry}>
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
          <Animated.View style={[styles.content, entranceStyle]}>
            <View style={styles.header}>
              <View style={styles.brandGroup}>
                <Pressable
                  accessibilityHint="Returns to the goal step"
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
                2 of 6
              </Text>
            </View>

            <OnboardingProgress
              currentStep={2}
              reducedMotion={reducedMotion}
              settled={behaviorCaptured}
              totalSteps={6}
            />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text style={styles.headline}>What will you promise?</Text>
                <Text style={styles.supportingCopy}>
                  Your goal is the reason. Now choose a behavior you can control.
                </Text>
                <Text style={styles.secondaryCopy}>We’ll decide when it counts next.</Text>
              </View>

              <View style={styles.directionSection}>
                <View aria-hidden style={styles.directionThread} />
                <View style={styles.directions}>
                  {DIRECTIONS.map((direction) => (
                    <BehaviorDirectionChoice
                      key={direction.value}
                      description={direction.description}
                      label={direction.label}
                      onPress={() => selectDirection(direction.value)}
                      reducedMotion={reducedMotion}
                      selected={behaviorDirection === direction.value}
                    />
                  ))}
                </View>
              </View>

              {behaviorDirection && inputContent && (
                <Animated.View style={[styles.behaviorStage, surfaceStyle]}>
                  <View aria-hidden style={styles.behaviorThread} />
                  <View aria-hidden style={styles.behaviorAnchor} />
                  <View aria-hidden style={styles.behaviorUnderlay} />
                  <View style={styles.behaviorSurface}>
                    <View style={styles.behaviorHeader}>
                      <Text style={styles.inputLabel}>{inputContent.label}</Text>
                      <View aria-hidden style={styles.surfaceMark}>
                        <View style={styles.surfaceMarkLine} />
                        <View style={styles.surfaceMarkNode} />
                      </View>
                    </View>
                    <TextInput
                      ref={inputRef}
                      accessibilityLabel={inputContent.label}
                      autoCapitalize="sentences"
                      autoCorrect
                      maxLength={BEHAVIOR_MAX_LENGTH}
                      onChangeText={updateBehavior}
                      placeholder={inputContent.placeholder}
                      placeholderTextColor={theme.colors.warmGrey}
                      selectionColor={theme.colors.copperBright}
                      style={styles.input}
                      value={behaviorText}
                    />
                    <View style={styles.behaviorFooter}>
                      <View aria-hidden style={styles.behaviorStitch} />
                      {showCounter && (
                        <Text accessibilityLiveRegion="polite" style={styles.counter}>
                          {behaviorText.length}/{BEHAVIOR_MAX_LENGTH}
                        </Text>
                      )}
                    </View>
                  </View>
                </Animated.View>
              )}
            </View>

            <View style={styles.footer}>
              <View style={styles.confirmationSlot}>
                <Animated.View
                  accessibilityElementsHidden={!behaviorCaptured}
                  accessibilityLiveRegion="polite"
                  importantForAccessibility={
                    behaviorCaptured ? 'yes' : 'no-hide-descendants'
                  }
                  style={[styles.confirmationPanel, confirmationStyle]}
                >
                  {behaviorCaptured && (
                    <>
                      <View aria-hidden style={styles.confirmationNode} />
                      <Text style={styles.confirmation}>
                        Behavior captured. Next, we’ll set the rhythm.
                      </Text>
                    </>
                  )}
                </Animated.View>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint={
                  canContinue
                    ? 'Captures this behavior on the current development screen'
                    : 'Choose a direction and enter a behavior before continuing'
                }
                disabled={!canContinue || behaviorCaptured}
                label="Continue"
                onPress={continueWithBehavior}
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
    gap: 24,
    paddingTop: 18,
  },
  intro: {
    gap: 10,
  },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({
      android: 'serif',
      default: 'Georgia',
      ios: 'Georgia',
      web: 'Georgia',
    }),
    fontSize: 39,
    fontWeight: '400',
    letterSpacing: -0.6,
    lineHeight: 45,
  },
  supportingCopy: {
    maxWidth: 500,
    color: theme.colors.boneMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  secondaryCopy: {
    color: theme.colors.warmGrey,
    fontSize: 13,
    lineHeight: 19,
  },
  directionSection: {
    position: 'relative',
  },
  directionThread: {
    position: 'absolute',
    top: 16.5,
    right: 0,
    left: 0,
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.66,
  },
  directions: {
    flexDirection: 'row',
  },
  behaviorStage: {
    position: 'relative',
    paddingHorizontal: 8,
  },
  behaviorThread: {
    position: 'absolute',
    top: '56%',
    right: -26,
    left: -26,
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.62,
  },
  behaviorAnchor: {
    position: 'absolute',
    left: -28,
    top: '52.5%',
    zIndex: 3,
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: theme.colors.copperBright,
    borderRadius: 5,
    backgroundColor: theme.colors.deepInk,
  },
  behaviorUnderlay: {
    position: 'absolute',
    top: 7,
    right: 2,
    bottom: -7,
    left: 14,
    borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.deepInk,
  },
  behaviorSurface: {
    zIndex: 2,
    minHeight: 146,
    borderWidth: 1,
    borderColor: theme.colors.structureLine,
    borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: theme.colors.deepInk,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.84,
    shadowRadius: 10,
    elevation: 8,
  },
  behaviorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    color: theme.colors.copperBright,
    fontSize: 13,
    fontWeight: '500',
  },
  surfaceMark: {
    width: 34,
    height: 12,
    justifyContent: 'center',
  },
  surfaceMarkLine: {
    width: '100%',
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.65,
  },
  surfaceMarkNode: {
    position: 'absolute',
    right: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.copperBright,
  },
  input: {
    minHeight: 62,
    color: theme.colors.bone,
    fontSize: 25,
    fontWeight: '400',
    lineHeight: 32,
    paddingHorizontal: 0,
    paddingTop: 14,
    paddingBottom: 8,
  },
  behaviorFooter: {
    minHeight: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  behaviorStitch: {
    width: 58,
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.62,
  },
  counter: {
    color: theme.colors.warmGrey,
    fontSize: 12,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 26,
  },
  confirmationSlot: {
    minHeight: 46,
    justifyContent: 'center',
    paddingBottom: 8,
  },
  confirmationPanel: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.copper,
    paddingHorizontal: 4,
    paddingVertical: 8,
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
