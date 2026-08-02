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
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { RhythmAnchorChoice } from '@/components/onboarding/rhythm-anchor-choice';
import { kinwinTheme as theme } from '@/constants/theme';
import {
  RhythmPeriod,
  RhythmState,
  RhythmTimeUnit,
  RhythmType,
  useOnboarding,
  Weekday,
} from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const BUILD_RHYTHMS: {
  description: string;
  label: string;
  value: RhythmType;
}[] = [
  {
    description: 'One completion each day.',
    label: 'Every day',
    value: 'daily',
  },
  {
    description: 'Complete it flexibly within each week.',
    label: 'Times per week',
    value: 'weekly_count',
  },
  {
    description: 'Complete it on chosen days.',
    label: 'Specific days',
    value: 'specific_days',
  },
];

const WEEKDAYS: { label: string; short: string; value: Weekday }[] = [
  { label: 'Monday', short: 'M', value: 'monday' },
  { label: 'Tuesday', short: 'T', value: 'tuesday' },
  { label: 'Wednesday', short: 'W', value: 'wednesday' },
  { label: 'Thursday', short: 'T', value: 'thursday' },
  { label: 'Friday', short: 'F', value: 'friday' },
  { label: 'Saturday', short: 'S', value: 'saturday' },
  { label: 'Sunday', short: 'S', value: 'sunday' },
];

const PERIODS: { description: string; label: string; value: RhythmPeriod }[] = [
  { description: 'Apply the boundary each day.', label: 'Per day', value: 'day' },
  { description: 'Apply the boundary across each week.', label: 'Per week', value: 'week' },
];

const TIME_UNITS: {
  description: string;
  label: string;
  value: RhythmTimeUnit;
}[] = [
  { description: 'Track the boundary in minutes.', label: 'Minutes', value: 'minutes' },
  { description: 'Track the boundary in hours.', label: 'Hours', value: 'hours' },
];

function parsePositiveValue(rawValue: string) {
  const parsed = Number(rawValue.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function joinWeekdays(days: Weekday[]) {
  const labels = WEEKDAYS.filter((day) => days.includes(day.value)).map(
    (day) => day.label,
  );

  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

export default function RhythmScreen() {
  const router = useRouter();
  const limitInputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();
  const {
    behaviorDirection,
    behaviorText,
    definitionText,
    measurementMode,
    rhythm,
    setRhythm,
  } = useOnboarding();
  const [rhythmCaptured, setRhythmCaptured] = useState(false);
  const entranceProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const confirmationProgress = useSharedValue(0);

  useEffect(() => {
    setRhythm((current) => {
      if (behaviorDirection === 'stop' && current.type !== 'continuous') {
        return { ...current, type: 'continuous' };
      }

      if (
        behaviorDirection === 'cut' &&
        current.type !== 'maximum_per_period'
      ) {
        return { ...current, type: 'maximum_per_period' };
      }

      if (
        behaviorDirection === 'build' &&
        current.type &&
        !['daily', 'weekly_count', 'specific_days'].includes(current.type)
      ) {
        return { ...current, type: null };
      }

      return current;
    });
  }, [behaviorDirection, setRhythm]);

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
      confirmationProgress.value = rhythmCaptured ? 1 : 0;
      return;
    }

    confirmationProgress.value = withTiming(rhythmCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
  }, [confirmationProgress, reducedMotion, rhythmCaptured]);

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

  const parsedValue = parsePositiveValue(rhythm.targetValue);
  const isBuildValid = Boolean(
    behaviorDirection === 'build' &&
      (rhythm.type === 'daily' ||
        (rhythm.type === 'weekly_count' &&
          parsedValue &&
          Number.isInteger(parsedValue) &&
          parsedValue >= 1 &&
          parsedValue <= 7) ||
        (rhythm.type === 'specific_days' && rhythm.selectedWeekdays.length > 0)),
  );
  const isCutValid = Boolean(
    behaviorDirection === 'cut' &&
      rhythm.type === 'maximum_per_period' &&
      parsedValue &&
      rhythm.period &&
      (measurementMode !== 'count' || Number.isInteger(parsedValue)) &&
      (measurementMode !== 'time' || rhythm.timeUnit) &&
      (measurementMode !== 'amount' || rhythm.amountUnit.trim()),
  );
  const isStopValid =
    behaviorDirection === 'stop' &&
    measurementMode === 'abstinence' &&
    rhythm.type === 'continuous';
  const canContinue = isBuildValid || isCutValid || isStopValid;

  const updateRhythm = (updater: (current: RhythmState) => RhythmState) => {
    setRhythm(updater);
    setRhythmCaptured(false);
  };

  const selectBuildRhythm = (type: RhythmType) => {
    void playSelectionHaptic();
    updateRhythm((current) => {
      const currentValue = parsePositiveValue(current.targetValue);
      const hasValidWeeklyValue = Boolean(
        currentValue && Number.isInteger(currentValue) && currentValue <= 7,
      );

      return {
        ...current,
        targetValue:
          type === 'weekly_count' && !hasValidWeeklyValue
            ? '3'
            : current.targetValue,
        type,
      };
    });
  };

  const adjustWeeklyCount = (change: number) => {
    void playSelectionHaptic();
    const currentValue = parsePositiveValue(rhythm.targetValue) ?? 3;
    const nextValue = Math.min(7, Math.max(1, Math.round(currentValue) + change));
    updateRhythm((current) => ({ ...current, targetValue: String(nextValue) }));
  };

  const toggleWeekday = (weekday: Weekday) => {
    void playSelectionHaptic();
    updateRhythm((current) => ({
      ...current,
      selectedWeekdays: current.selectedWeekdays.includes(weekday)
        ? current.selectedWeekdays.filter((day) => day !== weekday)
        : [...current.selectedWeekdays, weekday],
    }));
  };

  const selectPeriod = (period: RhythmPeriod) => {
    void playSelectionHaptic();
    updateRhythm((current) => ({ ...current, period }));
  };

  const selectTimeUnit = (timeUnit: RhythmTimeUnit) => {
    void playSelectionHaptic();
    updateRhythm((current) => ({ ...current, timeUnit }));
  };

  const updateLimit = (value: string) => {
    const pattern = measurementMode === 'count' ? /^\d*$/ : /^\d*[.,]?\d*$/;
    if (!pattern.test(value)) return;
    updateRhythm((current) => ({ ...current, targetValue: value }));
  };

  const updateAmountUnit = (amountUnit: string) => {
    updateRhythm((current) => ({ ...current, amountUnit }));
  };

  const continueWithRhythm = () => {
    if (!canContinue || rhythmCaptured) return;
    Keyboard.dismiss();
    limitInputRef.current?.blur();
    void playImportantHaptic();
    setRhythmCaptured(false);
    router.push('/onboarding/timeframe');
  };

  const behavior = behaviorText || 'Your behavior';
  let summary = '';

  if (behaviorDirection === 'build') {
    if (rhythm.type === 'daily') {
      summary = `${behavior} every day`;
    } else if (rhythm.type === 'weekly_count' && parsedValue) {
      summary = `${behavior} ${parsedValue} ${parsedValue === 1 ? 'time' : 'times'} per week`;
    } else if (rhythm.type === 'specific_days' && rhythm.selectedWeekdays.length > 0) {
      summary = `${behavior} every ${joinWeekdays(rhythm.selectedWeekdays)}`;
    }
  } else if (behaviorDirection === 'cut' && parsedValue && rhythm.period) {
    const unit =
      measurementMode === 'count'
        ? 'occurrences'
        : measurementMode === 'time'
          ? rhythm.timeUnit ?? ''
          : rhythm.amountUnit.trim();
    if (unit) {
      summary = `${behavior}: maximum ${rhythm.targetValue} ${unit} per ${rhythm.period}`;
    }
  } else if (behaviorDirection === 'stop') {
    summary = `${behavior}: continuous abstinence`;
  }

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
                  accessibilityHint="Returns to the definition step"
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
                4 of 6
              </Text>
            </View>

            <OnboardingProgress
              currentStep={4}
              reducedMotion={reducedMotion}
              settled={rhythmCaptured}
              totalSteps={6}
            />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text style={styles.headline}>What rhythm will hold?</Text>
                <Text style={styles.supportingCopy}>
                  Set when your promise applies. We’ll decide how long it lasts next.
                </Text>
              </View>

              <View style={styles.promiseAnchor}>
                <View aria-hidden style={styles.promiseNode} />
                <View style={styles.promiseContent}>
                  <Text style={styles.promiseLabel}>PROMISE IN PROGRESS</Text>
                  <Text numberOfLines={1} style={styles.promiseText}>{behavior}</Text>
                  <Text numberOfLines={1} style={styles.definitionText}>
                    {definitionText || 'Definition carried from step 3'}
                  </Text>
                </View>
              </View>

              {behaviorDirection === 'build' && (
                <View style={styles.choiceSection}>
                  <Text style={styles.sectionLabel}>How should it fit your week?</Text>
                  <View aria-hidden style={styles.choiceThread} />
                  <View style={styles.choiceRow}>
                    {BUILD_RHYTHMS.map((choice) => (
                      <RhythmAnchorChoice
                        key={choice.value}
                        description={choice.description}
                        label={choice.label}
                        onPress={() => selectBuildRhythm(choice.value)}
                        reducedMotion={reducedMotion}
                        selected={rhythm.type === choice.value}
                      />
                    ))}
                  </View>
                </View>
              )}

              {behaviorDirection === 'build' && rhythm.type === 'daily' && (
                <View style={styles.establishedState}>
                  <Text style={styles.establishedTitle}>Every day</Text>
                  <Text style={styles.establishedCopy}>One completion per active day.</Text>
                </View>
              )}

              {behaviorDirection === 'build' && rhythm.type === 'weekly_count' && (
                <View style={styles.stepperSection}>
                  <Text style={styles.controlLabel}>Completions each week</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityLabel="Decrease completions"
                      accessibilityRole="button"
                      hitSlop={5}
                      onPress={() => adjustWeeklyCount(-1)}
                      style={({ pressed }) => [
                        styles.stepperAction,
                        pressed && styles.controlPressed,
                      ]}
                    >
                      <Text aria-hidden style={styles.stepperSymbol}>−</Text>
                    </Pressable>
                    <View style={styles.stepperValue}>
                      <Text accessibilityLiveRegion="polite" style={styles.stepperNumber}>
                        {rhythm.targetValue || '3'}
                      </Text>
                      <Text style={styles.stepperUnit}>PER WEEK</Text>
                    </View>
                    <Pressable
                      accessibilityLabel="Increase completions"
                      accessibilityRole="button"
                      hitSlop={5}
                      onPress={() => adjustWeeklyCount(1)}
                      style={({ pressed }) => [
                        styles.stepperAction,
                        pressed && styles.controlPressed,
                      ]}
                    >
                      <Text aria-hidden style={styles.stepperSymbol}>＋</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {behaviorDirection === 'build' && rhythm.type === 'specific_days' && (
                <View style={styles.weekdaySection}>
                  <Text style={styles.controlLabel}>Active days</Text>
                  <View aria-hidden style={styles.weekdayThread} />
                  <View style={styles.weekdays}>
                    {WEEKDAYS.map((weekday) => {
                      const selected = rhythm.selectedWeekdays.includes(weekday.value);
                      return (
                        <Pressable
                          key={weekday.value}
                          accessibilityHint="Toggles this active day"
                          accessibilityLabel={weekday.label}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          hitSlop={2}
                          onPress={() => toggleWeekday(weekday.value)}
                          style={({ pressed }) => [
                            styles.weekday,
                            selected && styles.selectedWeekday,
                            pressed && styles.controlPressed,
                          ]}
                        >
                          <View
                            aria-hidden
                            style={[styles.weekdayNode, selected && styles.selectedWeekdayNode]}
                          />
                          <Text
                            style={[styles.weekdayLabel, selected && styles.selectedWeekdayLabel]}
                          >
                            {weekday.short}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {behaviorDirection === 'cut' && (
                <View style={styles.cutSection}>
                  <Text style={styles.sectionLabel}>What boundary will you keep?</Text>
                  <View style={styles.boundarySurface}>
                    <View style={styles.boundaryRow}>
                      <View style={styles.limitField}>
                        <Text style={styles.inputEyebrow}>Maximum</Text>
                        <TextInput
                          ref={limitInputRef}
                          accessibilityLabel="Maximum limit"
                          keyboardType={measurementMode === 'count' ? 'number-pad' : 'decimal-pad'}
                          onChangeText={updateLimit}
                          placeholder="0"
                          placeholderTextColor={theme.colors.warmGrey}
                          selectionColor={theme.colors.copperBright}
                          style={styles.limitInput}
                          value={rhythm.targetValue}
                        />
                      </View>
                      {measurementMode === 'count' && (
                        <View style={styles.fixedUnit}>
                          <Text style={styles.fixedUnitText}>occurrences</Text>
                        </View>
                      )}
                      {measurementMode === 'amount' && (
                        <TextInput
                          accessibilityLabel="Amount unit"
                          autoCapitalize="none"
                          maxLength={20}
                          onChangeText={updateAmountUnit}
                          placeholder="SEK, servings, items…"
                          placeholderTextColor={theme.colors.warmGrey}
                          selectionColor={theme.colors.copperBright}
                          style={styles.unitInput}
                          value={rhythm.amountUnit}
                        />
                      )}
                    </View>

                    {measurementMode === 'time' && (
                      <View style={styles.inlineChoiceSection}>
                        <Text style={styles.inlineLabel}>Time unit</Text>
                        <View aria-hidden style={styles.inlineThread} />
                        <View style={styles.choiceRow}>
                          {TIME_UNITS.map((choice) => (
                            <RhythmAnchorChoice
                              key={choice.value}
                              compact
                              description={choice.description}
                              label={choice.label}
                              onPress={() => selectTimeUnit(choice.value)}
                              reducedMotion={reducedMotion}
                              selected={rhythm.timeUnit === choice.value}
                            />
                          ))}
                        </View>
                      </View>
                    )}

                    <View style={styles.inlineChoiceSection}>
                      <Text style={styles.inlineLabel}>Period</Text>
                      <View aria-hidden style={styles.inlineThread} />
                      <View style={styles.choiceRow}>
                        {PERIODS.map((choice) => (
                          <RhythmAnchorChoice
                            key={choice.value}
                            compact
                            description={choice.description}
                            label={choice.label}
                            onPress={() => selectPeriod(choice.value)}
                            reducedMotion={reducedMotion}
                            selected={rhythm.period === choice.value}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {behaviorDirection === 'stop' && (
                <View style={styles.continuousState}>
                  <View aria-hidden style={styles.continuousThread} />
                  <Text style={styles.continuousTitle}>Continuous</Text>
                  <Text style={styles.continuousCopy}>
                    This promise applies every day throughout the challenge.
                  </Text>
                  <Text style={styles.continuousSecondary}>
                    There are no planned off-days. Recovery and exceptional circumstances
                    are handled separately.
                  </Text>
                </View>
              )}

              {Boolean(summary) && (
                <View style={styles.summary}>
                  <Text style={styles.summaryLabel}>RHYTHM SET</Text>
                  <Text accessibilityLiveRegion="polite" style={styles.summaryText}>
                    {summary}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <View style={styles.confirmationSlot}>
                <Animated.View
                  accessibilityElementsHidden={!rhythmCaptured}
                  accessibilityLiveRegion="polite"
                  importantForAccessibility={
                    rhythmCaptured ? 'yes' : 'no-hide-descendants'
                  }
                  style={[styles.confirmationPanel, confirmationStyle]}
                >
                  {rhythmCaptured && (
                    <>
                      <View aria-hidden style={styles.confirmationNode} />
                      <Text style={styles.confirmation}>
                        Rhythm captured. Next, we’ll choose the timeframe.
                      </Text>
                    </>
                  )}
                </Animated.View>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint={
                  canContinue
                    ? 'Continues to choose the challenge timeframe'
                    : 'Complete the rhythm or boundary before continuing'
                }
                disabled={!canContinue || rhythmCaptured}
                label="Continue"
                onPress={continueWithRhythm}
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
  promiseAnchor: {
    minHeight: 62, flexDirection: 'row', alignItems: 'center',
    borderLeftWidth: 1, borderLeftColor: theme.colors.copper, paddingLeft: 14,
  },
  promiseNode: {
    width: 7, height: 7, marginRight: 12, borderRadius: 4,
    backgroundColor: theme.colors.copperBright,
  },
  promiseContent: { flex: 1 },
  promiseLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  promiseText: { marginTop: 5, color: theme.colors.bone, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  definitionText: { marginTop: 2, color: theme.colors.warmGrey, fontSize: 12, lineHeight: 17 },
  choiceSection: { position: 'relative' },
  sectionLabel: { marginBottom: 8, color: theme.colors.boneMuted, fontSize: 13, fontWeight: '600' },
  choiceThread: {
    position: 'absolute', top: 41.5, right: 0, left: 0, height: 1,
    backgroundColor: theme.colors.copper, opacity: 0.66,
  },
  choiceRow: { flexDirection: 'row' },
  establishedState: {
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    borderLeftWidth: 2, borderLeftColor: theme.colors.copper,
    backgroundColor: theme.colors.surface, paddingHorizontal: 18, paddingVertical: 15,
  },
  establishedTitle: { color: theme.colors.bone, fontSize: 19, fontWeight: '600' },
  establishedCopy: { marginTop: 5, color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  controlLabel: { marginBottom: 9, color: theme.colors.copper, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  stepperSection: { gap: 4 },
  stepper: {
    minHeight: 72, flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface,
  },
  stepperAction: { width: 72, alignItems: 'center', justifyContent: 'center' },
  stepperSymbol: { color: theme.colors.copperBright, fontSize: 26, fontWeight: '300' },
  stepperValue: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderLeftWidth: 1, borderColor: theme.colors.structureLine,
  },
  stepperNumber: { color: theme.colors.bone, fontSize: 27, fontWeight: '600' },
  stepperUnit: { marginTop: 2, color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  controlPressed: { backgroundColor: theme.colors.surfaceRaised },
  weekdaySection: { position: 'relative' },
  weekdayThread: {
    position: 'absolute', top: 43, right: 0, left: 0, height: 1,
    backgroundColor: theme.colors.copper, opacity: 0.62,
  },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: { minWidth: 42, minHeight: 62, alignItems: 'center', paddingTop: 15 },
  selectedWeekday: { backgroundColor: theme.colors.surface },
  weekdayNode: {
    width: 10, height: 10, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: 5, backgroundColor: theme.colors.deepInk,
  },
  selectedWeekdayNode: {
    width: 14, height: 14, borderColor: theme.colors.copperBright,
    borderWidth: 3, borderRadius: 7, backgroundColor: theme.colors.copper,
  },
  weekdayLabel: { marginTop: 9, color: theme.colors.warmGrey, fontSize: 13, fontWeight: '700' },
  selectedWeekdayLabel: { color: theme.colors.bone },
  cutSection: { gap: 8 },
  boundarySurface: {
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingTop: 14,
  },
  boundaryRow: { minHeight: 78, flexDirection: 'row', alignItems: 'stretch' },
  limitField: { flex: 1, justifyContent: 'center' },
  inputEyebrow: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  limitInput: {
    minHeight: 50, color: theme.colors.bone, fontSize: 28, fontWeight: '500',
    paddingHorizontal: 0, paddingVertical: 5,
  },
  fixedUnit: {
    minWidth: 120, alignItems: 'flex-end', justifyContent: 'center',
    borderLeftWidth: 1, borderLeftColor: theme.colors.structureLine, paddingLeft: 14,
  },
  fixedUnitText: { color: theme.colors.boneMuted, fontSize: 14 },
  unitInput: {
    width: '48%', color: theme.colors.bone, fontSize: 15,
    borderLeftWidth: 1, borderLeftColor: theme.colors.structureLine,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  inlineChoiceSection: { position: 'relative', borderTopWidth: 1, borderTopColor: theme.colors.structureLine },
  inlineLabel: { marginTop: 10, color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  inlineThread: {
    position: 'absolute', top: 42, right: 0, left: 0, height: 1,
    backgroundColor: theme.colors.copper, opacity: 0.58,
  },
  continuousState: {
    position: 'relative', overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: theme.colors.structureLine, borderLeftWidth: 2,
    borderLeftColor: theme.colors.copperBright, backgroundColor: theme.colors.surface,
    paddingHorizontal: 20, paddingVertical: 20,
  },
  continuousThread: {
    position: 'absolute', top: 18, right: 0, width: 84, height: 1,
    backgroundColor: theme.colors.copper, opacity: 0.72,
  },
  continuousTitle: {
    color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 27, fontWeight: '400', lineHeight: 32,
  },
  continuousCopy: { marginTop: 9, color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  continuousSecondary: { marginTop: 8, color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  summary: {
    borderLeftWidth: 1, borderLeftColor: theme.colors.copper,
    backgroundColor: theme.colors.copperDeep, paddingHorizontal: 14, paddingVertical: 12,
  },
  summaryLabel: { color: theme.colors.copperBright, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  summaryText: { marginTop: 5, color: theme.colors.bone, fontSize: 15, lineHeight: 21 },
  footer: { marginTop: 'auto', paddingTop: 24 },
  confirmationSlot: { minHeight: 46, justifyContent: 'center', paddingBottom: 8 },
  confirmationPanel: {
    minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.copper,
    paddingHorizontal: 4, paddingVertical: 8,
  },
  confirmationNode: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  confirmation: { flex: 1, color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
});
