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
import { DefinitionExampleChoice } from '@/components/onboarding/definition-example-choice';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { kinwinTheme as theme } from '@/constants/theme';
import {
  MeasurementMode,
  useOnboarding,
} from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const DEFINITION_MAX_LENGTH = 140;
const COUNTER_THRESHOLD = 120;

const MEASUREMENT_CHOICES: {
  description: string;
  label: string;
  value: MeasurementMode;
}[] = [
  {
    description: 'Each separate time it happens.',
    label: 'Times',
    value: 'count',
  },
  {
    description: 'The total minutes or hours.',
    label: 'Time spent',
    value: 'time',
  },
  {
    description: 'A quantity such as puffs, pods, servings, items, or money.',
    label: 'Amount',
    value: 'amount',
  },
];

const BUILD_EXAMPLES = [
  'Complete the planned session',
  'Spend at least 30 minutes',
  'Finish the full routine',
] as const;

const STOP_EXAMPLES = [
  'Any use at all',
  'Even one occurrence',
  'Using or buying it',
] as const;

const DEFINITION_CONTENT: Record<
  MeasurementMode,
  { helper: string; label: string; placeholder: string }
> = {
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
    helper:
      'Choose the quantity that makes sense for your behavior. The exact limit and period come next.',
    label: 'The amount I’ll track is…',
    placeholder: 'Puffs, pods, items, SEK…',
  },
  abstinence: {
    helper: 'Be specific about what would count as breaking the promise.',
    label: 'A lapse means…',
    placeholder: 'Any use of a nicotine vape',
  },
};

const CUT_MODES: MeasurementMode[] = ['count', 'time', 'amount'];

export default function DefinitionScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();
  const {
    behaviorDirection,
    behaviorText,
    definitionText,
    measurementMode,
    setDefinitionText,
    setMeasurementMode,
  } = useOnboarding();
  const [definitionCaptured, setDefinitionCaptured] = useState(false);
  const entranceProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const surfaceProgress = useSharedValue(measurementMode ? 1 : 0);
  const confirmationProgress = useSharedValue(0);

  useEffect(() => {
    let nextMode: MeasurementMode | null = null;

    if (behaviorDirection === 'build') {
      nextMode = 'completion';
    } else if (behaviorDirection === 'stop') {
      nextMode = 'abstinence';
    } else if (
      behaviorDirection === 'cut' &&
      measurementMode &&
      CUT_MODES.includes(measurementMode)
    ) {
      nextMode = measurementMode;
    }

    if (measurementMode !== nextMode) {
      setMeasurementMode(nextMode);
      setDefinitionCaptured(false);
    }
  }, [behaviorDirection, measurementMode, setMeasurementMode]);

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
      surfaceProgress.value = measurementMode ? 1 : 0;
      return;
    }

    surfaceProgress.value = withTiming(measurementMode ? 1 : 0, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [measurementMode, reducedMotion, surfaceProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      confirmationProgress.value = definitionCaptured ? 1 : 0;
      return;
    }

    confirmationProgress.value = withTiming(definitionCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
  }, [confirmationProgress, definitionCaptured, reducedMotion]);

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

  const hasValidMode = Boolean(
    (behaviorDirection === 'build' && measurementMode === 'completion') ||
      (behaviorDirection === 'stop' && measurementMode === 'abstinence') ||
      (behaviorDirection === 'cut' &&
        measurementMode &&
        CUT_MODES.includes(measurementMode)),
  );
  const canContinue = hasValidMode && definitionText.trim().length >= 3;
  const showCounter = definitionText.length >= COUNTER_THRESHOLD;
  const definitionContent = measurementMode
    ? DEFINITION_CONTENT[measurementMode]
    : null;
  const examples =
    behaviorDirection === 'build'
      ? BUILD_EXAMPLES
      : behaviorDirection === 'stop'
        ? STOP_EXAMPLES
        : null;
  const behaviorForCopy = behaviorText.trim() || 'this behavior';
  const headline =
    behaviorDirection === 'build'
      ? 'What counts as done?'
      : behaviorDirection === 'cut'
        ? 'How should Kinwin measure it?'
        : behaviorDirection === 'stop'
          ? 'What counts as a lapse?'
          : 'What counts?';
  const supportingCopy =
    behaviorDirection === 'build'
      ? 'Define the minimum that makes one completion count.'
      : behaviorDirection === 'cut'
        ? `You chose to cut back “${behaviorForCopy}”. Choose what Kinwin should track.`
        : behaviorDirection === 'stop'
          ? 'Define clearly what would break this promise.'
          : 'Define the promise clearly now, so it stays fair later.';

  const selectMeasurement = (mode: MeasurementMode) => {
    void playSelectionHaptic();
    setMeasurementMode(mode);
    setDefinitionCaptured(false);
  };

  const selectExample = (example: string) => {
    void playSelectionHaptic();
    setDefinitionText(example);
    setDefinitionCaptured(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const updateDefinition = (value: string) => {
    setDefinitionText(value);
    if (definitionCaptured) {
      setDefinitionCaptured(false);
    }
  };

  const continueWithDefinition = () => {
    if (!canContinue || definitionCaptured) return;
    Keyboard.dismiss();
    inputRef.current?.blur();
    void playImportantHaptic();
    setDefinitionCaptured(false);
    router.push('/onboarding/rhythm');
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
                  accessibilityHint="Returns to the behavior step"
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
                3 of 6
              </Text>
            </View>

            <OnboardingProgress
              currentStep={3}
              reducedMotion={reducedMotion}
              settled={definitionCaptured}
              totalSteps={6}
            />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text style={styles.headline}>{headline}</Text>
                <Text style={styles.supportingCopy}>{supportingCopy}</Text>
                <Text style={styles.secondaryCopy}>We’ll set the rhythm next.</Text>
              </View>

              <View style={styles.promiseAnchor}>
                <View aria-hidden style={styles.promiseNode} />
                <View>
                  <Text style={styles.promiseLabel}>PROMISE IN PROGRESS</Text>
                  <Text numberOfLines={2} style={styles.promiseText}>
                    {behaviorText || 'Return to step 2 to define your behavior'}
                  </Text>
                </View>
              </View>

              {behaviorDirection === 'cut' && (
                <View style={styles.measurementSection}>
                  <Text style={styles.measurementLabel}>How should this be measured?</Text>
                  <View style={styles.measurementThread} />
                  <View style={styles.measurements}>
                    {MEASUREMENT_CHOICES.map((choice) => (
                      <BehaviorDirectionChoice
                        key={choice.value}
                        description={choice.description}
                        label={choice.label}
                        onPress={() => selectMeasurement(choice.value)}
                        reducedMotion={reducedMotion}
                        selected={measurementMode === choice.value}
                      />
                    ))}
                  </View>
                </View>
              )}

              {definitionContent && hasValidMode && (
                <Animated.View style={[styles.definitionStage, surfaceStyle]}>
                  <View aria-hidden style={styles.definitionThread} />
                  <View aria-hidden style={styles.definitionAnchor} />
                  <View aria-hidden style={styles.definitionUnderlay} />
                  <View style={styles.definitionSurface}>
                    <View style={styles.definitionHeader}>
                      <Text style={styles.inputLabel}>{definitionContent.label}</Text>
                      <View aria-hidden style={styles.surfaceMark}>
                        <View style={styles.surfaceMarkLine} />
                        <View style={styles.surfaceMarkNode} />
                      </View>
                    </View>
                    <TextInput
                      ref={inputRef}
                      accessibilityLabel={definitionContent.label}
                      autoCapitalize="sentences"
                      autoCorrect
                      maxLength={DEFINITION_MAX_LENGTH}
                      multiline
                      onChangeText={updateDefinition}
                      placeholder={definitionContent.placeholder}
                      placeholderTextColor={theme.colors.warmGrey}
                      selectionColor={theme.colors.copperBright}
                      style={styles.input}
                      textAlignVertical="top"
                      value={definitionText}
                    />
                    <View style={styles.definitionFooter}>
                      <Text style={styles.helperText}>{definitionContent.helper}</Text>
                      {showCounter && (
                        <Text accessibilityLiveRegion="polite" style={styles.counter}>
                          {definitionText.length}/{DEFINITION_MAX_LENGTH}
                        </Text>
                      )}
                    </View>
                  </View>
                </Animated.View>
              )}

              {examples && (
                <View style={styles.examplesSection}>
                  <View style={styles.examplesHeader}>
                    <Text style={styles.examplesLabel}>Try an example</Text>
                    <View aria-hidden style={styles.examplesRule} />
                  </View>
                  <View style={styles.examples}>
                    {examples.map((example, index) => (
                      <DefinitionExampleChoice
                        key={example}
                        isLast={index === examples.length - 1}
                        label={example}
                        onPress={() => selectExample(example)}
                        reducedMotion={reducedMotion}
                        selected={definitionText === example}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <View style={styles.confirmationSlot}>
                <Animated.View
                  accessibilityElementsHidden={!definitionCaptured}
                  accessibilityLiveRegion="polite"
                  importantForAccessibility={
                    definitionCaptured ? 'yes' : 'no-hide-descendants'
                  }
                  style={[styles.confirmationPanel, confirmationStyle]}
                >
                  {definitionCaptured && (
                    <>
                      <View aria-hidden style={styles.confirmationNode} />
                      <Text style={styles.confirmation}>
                        Definition captured. Next, we’ll set the rhythm.
                      </Text>
                    </>
                  )}
                </Animated.View>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint={
                  canContinue
                    ? 'Captures this definition on the current development screen'
                    : 'Choose a measurement and define what counts before continuing'
                }
                disabled={!canContinue || definitionCaptured}
                label="Continue"
                onPress={continueWithDefinition}
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
    gap: 18,
    paddingTop: 16,
  },
  intro: {
    gap: 8,
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
    color: theme.colors.boneMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  secondaryCopy: {
    color: theme.colors.warmGrey,
    fontSize: 13,
    lineHeight: 19,
  },
  promiseAnchor: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.copper,
    paddingLeft: 14,
  },
  promiseNode: {
    width: 7,
    height: 7,
    marginRight: 12,
    borderRadius: 4,
    backgroundColor: theme.colors.copperBright,
  },
  promiseLabel: {
    color: theme.colors.copper,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  promiseText: {
    marginTop: 5,
    color: theme.colors.bone,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  measurementSection: {
    position: 'relative',
  },
  measurementLabel: {
    marginBottom: 8,
    color: theme.colors.boneMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  measurementThread: {
    position: 'absolute',
    top: 42.5,
    right: 0,
    left: 0,
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.66,
  },
  measurements: {
    flexDirection: 'row',
  },
  definitionStage: {
    position: 'relative',
    paddingHorizontal: 8,
  },
  definitionThread: {
    position: 'absolute',
    top: '55%',
    right: -26,
    left: -26,
    height: 1,
    backgroundColor: theme.colors.copper,
    opacity: 0.62,
  },
  definitionAnchor: {
    position: 'absolute',
    left: -28,
    top: '52%',
    zIndex: 3,
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: theme.colors.copperBright,
    borderRadius: 5,
    backgroundColor: theme.colors.deepInk,
  },
  definitionUnderlay: {
    position: 'absolute',
    top: 7,
    right: 2,
    bottom: -7,
    left: 14,
    borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.deepInk,
  },
  definitionSurface: {
    zIndex: 2,
    minHeight: 172,
    borderWidth: 1,
    borderColor: theme.colors.structureLine,
    borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: 22,
    paddingTop: 19,
    paddingBottom: 15,
    shadowColor: theme.colors.deepInk,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.84,
    shadowRadius: 10,
    elevation: 8,
  },
  definitionHeader: {
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
    maxHeight: 90,
    minHeight: 70,
    color: theme.colors.bone,
    fontSize: 21,
    fontWeight: '400',
    lineHeight: 28,
    paddingHorizontal: 0,
    paddingTop: 13,
    paddingBottom: 8,
  },
  definitionFooter: {
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.structureLine,
    paddingTop: 9,
  },
  helperText: {
    flex: 1,
    color: theme.colors.warmGrey,
    fontSize: 11,
    lineHeight: 16,
  },
  counter: {
    color: theme.colors.warmGrey,
    fontSize: 11,
  },
  examplesSection: {
    gap: 8,
  },
  examplesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  examplesLabel: {
    color: theme.colors.copper,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  examplesRule: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.structureLine,
  },
  examples: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.structureLine,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 24,
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
