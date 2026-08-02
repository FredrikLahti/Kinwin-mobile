import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { kinwinTheme as theme } from '@/constants/theme';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const PRIMARY_DURATIONS = [2, 4, 6, 8] as const;

type DurationAnchorProps = {
  duration: number;
  onPress: () => void;
  reducedMotion: boolean;
  selected: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function DurationAnchor({
  duration,
  onPress,
  reducedMotion,
  selected,
}: DurationAnchorProps) {
  const pressedScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : pressedScale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityHint="Sets the challenge duration"
      accessibilityLabel={`${duration} weeks`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={onPress}
      onPressIn={() => {
        pressedScale.value = withTiming(0.97, { duration: theme.motion.quick });
      }}
      onPressOut={() => {
        pressedScale.value = withTiming(1, { duration: theme.motion.quick });
      }}
      style={[styles.durationChoice, selected && styles.selectedDurationChoice, animatedStyle]}
    >
      <View aria-hidden style={[styles.durationNode, selected && styles.selectedDurationNode]}>
        <View style={[styles.durationCore, selected && styles.selectedDurationCore]} />
      </View>
      <Text style={[styles.durationNumber, selected && styles.selectedDurationNumber]}>
        {duration}
      </Text>
      <Text style={[styles.durationUnit, selected && styles.selectedDurationUnit]}>
        WEEKS
      </Text>
      <View aria-hidden style={[styles.selectionRule, selected && styles.selectedSelectionRule]} />
    </AnimatedPressable>
  );
}

function formatPromiseSummary(
  behaviorDirection: ReturnType<typeof useOnboarding>['behaviorDirection'],
  behaviorText: string,
  measurementMode: ReturnType<typeof useOnboarding>['measurementMode'],
  rhythm: ReturnType<typeof useOnboarding>['rhythm'],
) {
  const behavior = behaviorText.trim() || 'Your behavior';

  if (behaviorDirection === 'build') {
    if (rhythm.type === 'daily') return `${behavior} · Every day`;
    if (rhythm.type === 'weekly_count') {
      const count = Number(rhythm.targetValue);
      return `${behavior} · ${count || 0} ${count === 1 ? 'time' : 'times'} per week`;
    }
    if (rhythm.type === 'specific_days') {
      const count = rhythm.selectedWeekdays.length;
      return `${behavior} · ${count} selected ${count === 1 ? 'day' : 'days'} per week`;
    }
  }

  if (behaviorDirection === 'cut') {
    const unit =
      measurementMode === 'count'
        ? 'times'
        : measurementMode === 'time'
          ? rhythm.timeUnit ?? ''
          : rhythm.amountUnit.trim();
    const period = rhythm.period ? ` per ${rhythm.period}` : '';
    return `${behavior} · Maximum ${rhythm.targetValue}${unit ? ` ${unit}` : ''}${period}`;
  }

  if (behaviorDirection === 'stop') return `${behavior} · Continuous`;
  return `${behavior} · Rhythm ready`;
}

function formatTimeframePreview(
  durationWeeks: number,
  behaviorDirection: ReturnType<typeof useOnboarding>['behaviorDirection'],
  rhythm: ReturnType<typeof useOnboarding>['rhythm'],
) {
  const duration = `${durationWeeks} ${durationWeeks === 1 ? 'week' : 'weeks'}`;
  const totalDays = durationWeeks * 7;

  if (behaviorDirection === 'build') {
    if (rhythm.type === 'daily') return `${duration} · ${totalDays} active days`;
    if (rhythm.type === 'weekly_count') {
      const planned = Number(rhythm.targetValue) * durationWeeks;
      return `${duration} · ${planned} planned completions`;
    }
    if (rhythm.type === 'specific_days') {
      const planned = rhythm.selectedWeekdays.length * durationWeeks;
      return `${duration} · ${planned} planned completions`;
    }
  }

  if (behaviorDirection === 'cut') {
    if (rhythm.period === 'day') return `${duration} · ${totalDays} daily boundaries`;
    if (rhythm.period === 'week') return `${duration} · ${durationWeeks} weekly boundaries`;
  }

  if (behaviorDirection === 'stop') {
    return `${duration} · ${totalDays} continuous days`;
  }

  return duration;
}

export default function TimeframeScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const {
    behaviorDirection,
    behaviorText,
    durationWeeks,
    measurementMode,
    rhythm,
    setDurationWeeks,
  } = useOnboarding();
  const [customOpen, setCustomOpen] = useState(
    Boolean(durationWeeks && !PRIMARY_DURATIONS.includes(durationWeeks as never)),
  );
  const [timeframeCaptured, setTimeframeCaptured] = useState(false);
  const entranceProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const confirmationProgress = useSharedValue(0);
  const threadProgress = useSharedValue(0);

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
      confirmationProgress.value = timeframeCaptured ? 1 : 0;
      return;
    }

    confirmationProgress.value = withTiming(timeframeCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
  }, [confirmationProgress, reducedMotion, timeframeCaptured]);

  useEffect(() => {
    const primaryIndex = PRIMARY_DURATIONS.findIndex((value) => value === durationWeeks);
    const target = durationWeeks
      ? primaryIndex >= 0
        ? 0.125 + primaryIndex * 0.25
        : Math.min(1, durationWeeks / 12)
      : 0;

    threadProgress.value = withTiming(target, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [durationWeeks, reducedMotion, threadProgress]);

  const entranceStyle = useAnimatedStyle(() => ({
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

  const activeThreadStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: threadProgress.value }],
  }));

  const selectDuration = (duration: number) => {
    void playSelectionHaptic();
    setCustomOpen(false);
    setDurationWeeks(duration);
    setTimeframeCaptured(false);
  };

  const chooseCustomDuration = () => {
    void playSelectionHaptic();
    if (customOpen) {
      setCustomOpen(false);
      return;
    }

    setCustomOpen(true);
    setDurationWeeks((current) =>
      current && !PRIMARY_DURATIONS.includes(current as never) ? current : 5,
    );
    setTimeframeCaptured(false);
  };

  const adjustCustomDuration = (change: number) => {
    if (!durationWeeks) return;
    const nextDuration = Math.max(1, Math.min(12, durationWeeks + change));
    if (nextDuration === durationWeeks) return;
    void playSelectionHaptic();
    setDurationWeeks(nextDuration);
    setTimeframeCaptured(false);
  };

  const continueWithTimeframe = () => {
    if (!durationWeeks || timeframeCaptured) return;
    Keyboard.dismiss();
    void playImportantHaptic();
    setTimeframeCaptured(true);
  };

  const promiseSummary = formatPromiseSummary(
    behaviorDirection,
    behaviorText,
    measurementMode,
    rhythm,
  );
  const timeframePreview = durationWeeks
    ? formatTimeframePreview(durationWeeks, behaviorDirection, rhythm)
    : '';

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
                  accessibilityHint="Returns to the rhythm step"
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
                5 of 6
              </Text>
            </View>

            <OnboardingProgress
              currentStep={5}
              reducedMotion={reducedMotion}
              settled={timeframeCaptured}
              totalSteps={6}
            />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text style={styles.headline}>How long will you hold it?</Text>
                <Text style={styles.supportingCopy}>
                  Choose long enough to matter, but short enough to stay real.
                </Text>
                <Text style={styles.secondaryCopy}>
                  Next, we’ll decide what success looks like.
                </Text>
              </View>

              <View style={styles.promiseSummary}>
                <View aria-hidden style={styles.promiseNode} />
                <View style={styles.promiseContent}>
                  <Text style={styles.promiseLabel}>YOUR PROMISE SO FAR</Text>
                  <Text numberOfLines={2} style={styles.promiseText}>
                    {promiseSummary}
                  </Text>
                </View>
              </View>

              <View style={styles.durationSection}>
                <Text style={styles.sectionLabel}>Choose a timeframe</Text>
                <View aria-hidden style={styles.durationThread}>
                  <Animated.View style={[styles.activeDurationThread, activeThreadStyle]} />
                </View>
                <View style={styles.durationRow}>
                  {PRIMARY_DURATIONS.map((duration) => (
                    <DurationAnchor
                      key={duration}
                      duration={duration}
                      onPress={() => selectDuration(duration)}
                      reducedMotion={reducedMotion}
                      selected={!customOpen && durationWeeks === duration}
                    />
                  ))}
                </View>
              </View>

              <Pressable
                accessibilityHint="Reveals a duration control from 1 to 12 weeks"
                accessibilityLabel={
                  customOpen && durationWeeks
                    ? `Custom duration, ${durationWeeks} weeks`
                    : 'Choose another length'
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: customOpen }}
                onPress={chooseCustomDuration}
                style={({ pressed }) => [
                  styles.customAction,
                  customOpen && styles.customActionOpen,
                  pressed && styles.controlPressed,
                ]}
              >
                <View aria-hidden style={styles.customActionMark} />
                <Text style={styles.customActionText}>Choose another length</Text>
                <Text aria-hidden style={styles.customActionSymbol}>{customOpen ? '−' : '+'}</Text>
              </Pressable>

              {customOpen && durationWeeks && (
                <View
                  accessibilityLabel={`Custom duration, ${durationWeeks} ${durationWeeks === 1 ? 'week' : 'weeks'}`}
                  style={styles.customControl}
                >
                  <Pressable
                    accessibilityLabel="Decrease custom duration"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: durationWeeks <= 1 }}
                    disabled={durationWeeks <= 1}
                    onPress={() => adjustCustomDuration(-1)}
                    style={({ pressed }) => [
                      styles.customControlAction,
                      durationWeeks <= 1 && styles.disabledControl,
                      pressed && styles.controlPressed,
                    ]}
                  >
                    <Text aria-hidden style={styles.customControlSymbol}>−</Text>
                  </Pressable>
                  <View style={styles.customValue}>
                    <Text accessibilityLiveRegion="polite" style={styles.customNumber}>
                      {durationWeeks}
                    </Text>
                    <Text style={styles.customUnit}>
                      {durationWeeks === 1 ? 'week' : 'weeks'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Increase custom duration"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: durationWeeks >= 12 }}
                    disabled={durationWeeks >= 12}
                    onPress={() => adjustCustomDuration(1)}
                    style={({ pressed }) => [
                      styles.customControlAction,
                      durationWeeks >= 12 && styles.disabledControl,
                      pressed && styles.controlPressed,
                    ]}
                  >
                    <Text aria-hidden style={styles.customControlSymbol}>＋</Text>
                  </Pressable>
                </View>
              )}

              {Boolean(timeframePreview) && (
                <View style={styles.preview}>
                  <View aria-hidden style={styles.previewRule} />
                  <View style={styles.previewContent}>
                    <Text style={styles.previewLabel}>TIMEFRAME</Text>
                    <Text accessibilityLiveRegion="polite" style={styles.previewText}>
                      {timeframePreview}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <View style={styles.confirmationSlot}>
                <Animated.View
                  accessibilityElementsHidden={!timeframeCaptured}
                  accessibilityLiveRegion="polite"
                  importantForAccessibility={
                    timeframeCaptured ? 'yes' : 'no-hide-descendants'
                  }
                  style={[styles.confirmationPanel, confirmationStyle]}
                >
                  {timeframeCaptured && (
                    <>
                      <View aria-hidden style={styles.confirmationNode} />
                      <Text style={styles.confirmation}>
                        Timeframe captured. Next, we’ll define success.
                      </Text>
                    </>
                  )}
                </Animated.View>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint={
                  durationWeeks
                    ? 'Captures this timeframe on the current development screen'
                    : 'Choose a challenge duration before continuing'
                }
                disabled={!durationWeeks || timeframeCaptured}
                label="Continue"
                onPress={continueWithTimeframe}
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
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  backgroundGeometry: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  deepPlane: {
    position: 'absolute', top: 62, right: 12, bottom: 12, left: 12,
    borderRadius: theme.radius.precise, backgroundColor: theme.colors.deepInk, opacity: 0.62,
  },
  frameLine: {
    position: 'absolute', top: 62, right: 12, bottom: 12, left: 12,
    borderWidth: 1, borderColor: theme.colors.structureLine,
    borderRadius: theme.radius.precise, opacity: 0.34,
  },
  keyboardAvoidingView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: 26, paddingTop: 6, paddingBottom: 18,
  },
  header: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  stepLabel: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0.8 },
  main: { gap: 18, paddingTop: 16 },
  intro: { gap: 8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 39, fontWeight: '400', letterSpacing: -0.6, lineHeight: 45,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 15, lineHeight: 22 },
  secondaryCopy: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  promiseSummary: {
    minHeight: 66, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    borderLeftWidth: 2, borderLeftColor: theme.colors.copper,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 11,
  },
  promiseNode: {
    width: 7, height: 7, marginRight: 12, borderRadius: 4,
    backgroundColor: theme.colors.copperBright,
  },
  promiseContent: { flex: 1 },
  promiseLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  promiseText: { marginTop: 6, color: theme.colors.bone, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  durationSection: { position: 'relative' },
  sectionLabel: { marginBottom: 8, color: theme.colors.boneMuted, fontSize: 13, fontWeight: '600' },
  durationThread: {
    position: 'absolute', top: 48, right: 0, left: 0, height: 1,
    backgroundColor: theme.colors.structureLineStrong, opacity: 0.9, overflow: 'hidden',
  },
  activeDurationThread: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: 1.5,
    backgroundColor: theme.colors.copperBright, transformOrigin: 'left center',
  },
  durationRow: { flexDirection: 'row' },
  durationChoice: {
    minHeight: 108, flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 8,
  },
  selectedDurationChoice: { backgroundColor: theme.colors.surface },
  durationNode: {
    width: 11, height: 11, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: 6, backgroundColor: theme.colors.deepInk,
  },
  selectedDurationNode: {
    width: 17, height: 17, marginTop: -3, borderRadius: 2,
    borderColor: theme.colors.copperBright, transform: [{ rotate: '45deg' }],
  },
  durationCore: { width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.warmGrey },
  selectedDurationCore: {
    width: 7, height: 7, borderRadius: 1, backgroundColor: theme.colors.copperBright,
  },
  durationNumber: {
    marginTop: 13, color: theme.colors.boneMuted,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 26, fontWeight: '400', lineHeight: 30,
  },
  selectedDurationNumber: { color: theme.colors.bone },
  durationUnit: { marginTop: 1, color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  selectedDurationUnit: { color: theme.colors.copperBright },
  selectionRule: { width: 18, height: 1, marginTop: 8, backgroundColor: 'transparent' },
  selectedSelectionRule: { width: 30, height: 2, backgroundColor: theme.colors.copperBright },
  customAction: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 13,
  },
  customActionOpen: { borderLeftWidth: 2, borderLeftColor: theme.colors.copper, backgroundColor: theme.colors.surface },
  customActionMark: { width: 18, height: 1, marginRight: 12, backgroundColor: theme.colors.copper },
  customActionText: { flex: 1, color: theme.colors.boneMuted, fontSize: 14, fontWeight: '600' },
  customActionSymbol: { color: theme.colors.copperBright, fontSize: 20, fontWeight: '400' },
  customControl: {
    minHeight: 70, flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surfaceRaised,
  },
  customControlAction: { width: 68, alignItems: 'center', justifyContent: 'center' },
  customControlSymbol: { color: theme.colors.copperBright, fontSize: 25, fontWeight: '300' },
  customValue: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRightWidth: 1, borderLeftWidth: 1, borderColor: theme.colors.structureLine,
  },
  customNumber: { color: theme.colors.bone, fontSize: 27, fontWeight: '600' },
  customUnit: { color: theme.colors.boneMuted, fontSize: 13 },
  disabledControl: { opacity: 0.35 },
  controlPressed: { backgroundColor: theme.colors.surfaceFocused },
  preview: {
    minHeight: 62, flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: theme.colors.copperDeep,
  },
  previewRule: { width: 2, backgroundColor: theme.colors.copperBright },
  previewContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 11 },
  previewLabel: { color: theme.colors.copperBright, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  previewText: { marginTop: 5, color: theme.colors.bone, fontSize: 16, fontWeight: '600', lineHeight: 21 },
  footer: { marginTop: 'auto', paddingTop: 22 },
  confirmationSlot: { minHeight: 46, justifyContent: 'center', paddingBottom: 8 },
  confirmationPanel: {
    minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.copper,
    paddingHorizontal: 4, paddingVertical: 8,
  },
  confirmationNode: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  confirmation: { flex: 1, color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
});
