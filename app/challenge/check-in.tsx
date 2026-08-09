import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { kinwinTheme as theme } from '@/constants/theme';
import { useChallengePreview } from '@/contexts/challenge-preview-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';

type Result = 'build-counted' | 'build-not-yet' | 'cut' | 'stop-intact' | 'stop-lapse' | null;

function buildTarget(type: string | null, targetValue: string, selectedDays: unknown[]) {
  if (type === 'weekly_count') return Number(targetValue);
  if (type === 'specific_days') return selectedDays.length;
  return 1;
}

function formatValue(value: number, mode: string | null, unit: string) {
  if (mode === 'amount') return `${unit}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${mode === 'time' ? ` ${unit}` : ''}`;
}

export default function CheckInScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const preview = useChallengePreview();
  const { behaviorDirection, behaviorText, durationWeeks, measurementMode, rhythm } = onboarding;
  const [result, setResult] = useState<Result>(null);
  const [cutInput, setCutInput] = useState(preview.cutTotal === null ? '' : String(preview.cutTotal));
  const [confirmLapse, setConfirmLapse] = useState(false);
  const reveal = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const target = buildTarget(rhythm.type, rhythm.targetValue, rhythm.selectedWeekdays);
  const maximum = Number(rhythm.targetValue);
  const period = rhythm.period ?? (rhythm.type === 'daily' ? 'day' : 'week');
  const unit = measurementMode === 'time' ? rhythm.timeUnit ?? '' : measurementMode === 'amount' ? rhythm.amountUnit.trim() : 'times';
  const parsedInput = Number(cutInput.replace(',', '.'));
  const validCutInput = cutInput.trim() !== '' && Number.isFinite(parsedInput) && parsedInput >= 0 && (measurementMode !== 'count' || Number.isInteger(parsedInput));
  const basicDefinitionValid = Boolean(
    calculateSuccessRule(onboarding) && behaviorDirection && behaviorText.trim() && durationWeeks &&
    (behaviorDirection !== 'cut' || (rhythm.period && maximum > 0 && unit)),
  );

  useEffect(() => {
    reveal.value = withTiming(1, { duration: reducedMotion ? 0 : theme.motion.standard });
  }, [reducedMotion, reveal]);
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value, transform: [{ translateY: reducedMotion ? 0 : (1 - reveal.value) * 8 }] }));
  const backToChallenge = () => router.replace('/challenge' as Href);

  const countBuild = () => {
    if (preview.buildCompletions >= target) return;
    void playImportantHaptic();
    preview.recordBuildCompletion(target);
    setResult('build-counted');
  };
  const recordCut = () => {
    if (!validCutInput) return;
    void playImportantHaptic();
    preview.recordCutTotal(parsedInput);
    setResult('cut');
  };
  const recordStop = (status: 'intact' | 'lapse') => {
    void playImportantHaptic();
    preview.recordStopStatus(status);
    setResult(status === 'intact' ? 'stop-intact' : 'stop-lapse');
  };

  const nextBuildCount = Math.min(preview.buildCompletions + (result === 'build-counted' ? 0 : 1), target);
  const challengeLine = `Day 1 of ${(durationWeeks ?? 0) * 7} · ${
    behaviorDirection === 'build' ? `This ${period} ${preview.buildCompletions} of ${target}` :
    behaviorDirection === 'cut' ? (preview.cutTotal === null ? 'No total recorded' : `${formatValue(preview.cutTotal, measurementMode, unit)} of ${formatValue(maximum, measurementMode, unit)}`) :
    preview.stopStatus === null ? 'No check-in yet' : preview.stopStatus === 'intact' ? 'Promise intact' : 'Lapse recorded'
  }`;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Animated.View style={[styles.content, revealStyle]}>
            <View style={styles.header}>
              <Pressable accessibilityHint="Returns to the active challenge without recording" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.wordmark}>KINWIN</Text>
            </View>
            <View accessibilityRole="summary" style={styles.previewNotice}>
              <Text style={styles.previewLabel}>CHECK-IN PREVIEW</Text>
              <Text style={styles.previewText}>Nothing here is saved outside this prototype.</Text>
            </View>

            {!basicDefinitionValid ? (
              <View style={styles.main}>
                <Text style={styles.phaseLabel}>CHECK IN</Text>
                <Text accessibilityRole="header" style={styles.headline}>This preview needs a complete challenge.</Text>
                <Text style={styles.supporting}>Finish the behavior, rhythm, and success rule before recording a preview check-in.</Text>
                <AnimatedPrimaryButton accessibilityHint="Returns to challenge setup" label="Review challenge setup" onPress={() => router.push('/create/goal' as Href)} reducedMotion={reducedMotion} />
              </View>
            ) : result ? (
              <View accessibilityLiveRegion="polite" style={styles.main}>
                <Text style={styles.phaseLabel}>CHECK IN</Text>
                <Text accessibilityRole="header" style={styles.headline}>{
                  result === 'build-counted' ? 'Counted.' : result === 'build-not-yet' ? 'Not yet.' : result === 'cut' ? (parsedInput <= maximum ? 'Still within the limit.' : 'The limit has been crossed.') : result === 'stop-intact' ? 'Promise intact.' : 'Lapse recorded.'
                }</Text>
                <Text style={styles.resultCopy}>{
                  result === 'build-counted' ? (nextBuildCount >= target ? `This ${period}’s promise is complete.` : `${nextBuildCount} of ${target} complete this ${period}.`) :
                  result === 'build-not-yet' ? 'No problem. Check in after you complete it.' :
                  result === 'cut' ? (parsedInput <= maximum ? `${formatValue(parsedInput, measurementMode, unit)} of ${formatValue(maximum, measurementMode, unit)} this ${period}.` : `You recorded ${formatValue(parsedInput, measurementMode, unit)} against a limit of ${formatValue(maximum, measurementMode, unit)}.`) :
                  result === 'stop-intact' ? 'Keep going. The next choice still matters.' : 'The final consequence is not processed in this prototype.'
                }</Text>
                <AnimatedPrimaryButton accessibilityHint={result === 'stop-lapse' || (result === 'cut' && parsedInput > maximum) ? 'Opens a recovery plan without erasing this event' : 'Returns to the active challenge preview'} label={result === 'stop-lapse' || (result === 'cut' && parsedInput > maximum) ? 'Plan recovery' : 'Back to challenge'} onPress={result === 'stop-lapse' || (result === 'cut' && parsedInput > maximum) ? () => router.replace('/challenge/recovery' as Href) : backToChallenge} reducedMotion={reducedMotion} />
              </View>
            ) : (
              <View style={styles.main}>
                <Text style={styles.phaseLabel}>CHECK IN</Text>
                <Text style={styles.contextLine}>{challengeLine}</Text>
                <Text accessibilityRole="header" style={styles.headline}>{behaviorDirection === 'build' ? 'Did you do it?' : behaviorDirection === 'cut' ? 'Where are you now?' : 'Are you still keeping it?'}</Text>
                <Text style={styles.behavior}>{behaviorText.trim()}</Text>

                {behaviorDirection === 'build' && <>
                  <Text style={styles.boundary}>{rhythm.type === 'daily' ? 'Every day' : `${target} ${target === 1 ? 'time' : 'times'} per week`}</Text>
                  <Text style={styles.supporting}>{preview.buildCompletions >= target ? `This period’s required check-ins are complete.` : 'Only count it when the behavior is complete.'}</Text>
                  <AnimatedPrimaryButton accessibilityHint="Records one preview completion" disabled={preview.buildCompletions >= target} label="Yes, count it" onPress={countBuild} reducedMotion={reducedMotion} />
                  <SecondaryButton label="Not yet" onPress={() => { void playSelectionHaptic(); setResult('build-not-yet'); }} />
                </>}

                {behaviorDirection === 'cut' && <>
                  <Text style={styles.boundary}>Maximum {formatValue(maximum, measurementMode, unit)} per {period}</Text>
                  <Text style={styles.supporting}>Enter your current total for this period.</Text>
                  <View style={styles.inputRow}>
                    {measurementMode === 'amount' && <Text style={styles.inputUnit}>{unit}</Text>}
                    <TextInput accessibilityLabel={`Current total in ${unit}`} inputMode="decimal" keyboardType="decimal-pad" onChangeText={setCutInput} placeholder="0" placeholderTextColor={theme.colors.warmGrey} style={styles.input} value={cutInput} />
                    {measurementMode !== 'amount' && <Text style={styles.inputUnit}>{unit}</Text>}
                  </View>
                  <AnimatedPrimaryButton accessibilityHint="Records this current total in the preview" disabled={!validCutInput} label="Record total" onPress={recordCut} reducedMotion={reducedMotion} />
                </>}

                {behaviorDirection === 'stop' && (confirmLapse ? <View accessibilityLabel="Confirm recording a lapse" style={styles.confirmSurface}>
                  <Text accessibilityRole="header" style={styles.confirmTitle}>Record a lapse?</Text>
                  <Text style={styles.supporting}>This would affect the challenge result under the current success rule.</Text>
                  <AnimatedPrimaryButton accessibilityHint="Confirms and records one preview lapse" label="Record lapse" onPress={() => recordStop('lapse')} reducedMotion={reducedMotion} />
                  <SecondaryButton label="Go back" onPress={() => { void playSelectionHaptic(); setConfirmLapse(false); }} />
                </View> : <>
                  <Text style={styles.supporting}>Be honest. This check-in is for you.</Text>
                  <AnimatedPrimaryButton accessibilityHint="Records the preview promise as intact" label="Still keeping it" onPress={() => recordStop('intact')} reducedMotion={reducedMotion} />
                  <SecondaryButton label="I slipped" onPress={() => { void playSelectionHaptic(); setConfirmLapse(true); }} />
                </>)}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: theme.colors.ink }, scrollContent: { flexGrow: 1 },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center' }, backButton: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, lineHeight: 35 }, wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 }, pressed: { opacity: 0.65 },
  previewNotice: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine, paddingVertical: 9, paddingHorizontal: 12 },
  previewLabel: { color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 }, previewText: { marginTop: 3, color: theme.colors.warmGrey, fontSize: 10 },
  main: { gap: 16, paddingTop: 34 }, phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  contextLine: { color: theme.colors.warmGrey, fontSize: 11, lineHeight: 17 }, headline: { color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }), fontSize: 40, lineHeight: 46 },
  behavior: { borderLeftWidth: 2, borderLeftColor: theme.colors.copperBright, paddingLeft: 15, color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }), fontSize: 27, lineHeight: 34 },
  boundary: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700', lineHeight: 19 }, supporting: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 }, resultCopy: { marginBottom: 8, color: theme.colors.boneMuted, fontSize: 16, lineHeight: 24 },
  secondary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface }, secondaryText: { color: theme.colors.boneMuted, fontSize: 14, fontWeight: '700' },
  inputRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.copperBright, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 18 },
  input: { flex: 1, color: theme.colors.bone, fontSize: 30, paddingVertical: 12 }, inputUnit: { color: theme.colors.copperBright, fontSize: 14, fontWeight: '700', marginHorizontal: 6 },
  confirmSurface: { gap: 15, borderTopWidth: 1, borderTopColor: theme.colors.copperBright, backgroundColor: theme.colors.surfaceRaised, padding: 18 }, confirmTitle: { color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }), fontSize: 26 },
});
