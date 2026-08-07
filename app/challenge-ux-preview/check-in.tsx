import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useChallengeUxPreview } from '@/contexts/challenge-ux-preview-context';
import { CheckInAppendPlan } from '@/domain/challenge/check-in/append-plan';
import { CheckInFact } from '@/domain/challenge/check-in/types';
import { CheckInId } from '@/domain/challenge/types';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { describeFact, describePeriodTarget } from '@/lib/challenge-ux-preview/view-model';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

/**
 * The Build / Cut back / Stop check-in surface — also doubles as the
 * correction screen and Stop's final-attestation screen, since which of
 * those applies is entirely a function of the already-derived
 * `currentPeriodStatus` (see docs/CHALLENGE_CHECKIN_UX.md). Every submission
 * goes through the context's `submit`, which is a thin wrapper over the real
 * `planCheckInAppend` — this file never decides accept/reject itself.
 */
export default function ChallengeUxPreviewCheckIn() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const preview = useChallengeUxPreview();
  const { scenario, viewModel, submit } = preview;
  const period = scenario.periods.find((p) => p.id === viewModel.focusPeriodId)!;
  const status = viewModel.currentPeriodStatus;

  const [plan, setPlan] = useState<CheckInAppendPlan | null>(null);
  const [submittedFact, setSubmittedFact] = useState<CheckInFact | null>(null);
  const [dismissedNotToday, setDismissedNotToday] = useState(false);
  const [confirmLapse, setConfirmLapse] = useState(false);
  const [buildCount, setBuildCount] = useState(0);
  const [cutInput, setCutInput] = useState('');

  const backToHome = () => router.replace('/challenge-ux-preview/home' as Href);

  const displayedFact: CheckInFact | null =
    status.kind === 'reported' || status.kind === 'late_reported' || status.kind === 'closed_satisfied' || status.kind === 'closed_not_satisfied'
      ? status.fact
      : null;
  const correctionTarget = viewModel.correction.available ? viewModel.correction.targets[0] : null;

  const submitAndTrack = (fact: CheckInFact, correctionOfEventId?: CheckInId) => {
    void playImportantHaptic();
    setSubmittedFact(fact);
    setPlan(submit(fact, correctionOfEventId));
  };

  if (plan?.kind === 'insert' || plan?.kind === 'idempotent_replay') {
    const recordedFact = submittedFact ?? displayedFact;
    return (
      <Shell>
        <Text style={styles.phaseLabel}>CHECK IN</Text>
        <Text accessibilityRole="header" style={styles.headline}>Recorded.</Text>
        <Text style={styles.supporting}>{recordedFact ? describeFact(recordedFact) : 'Your check-in was recorded.'} It stays visible in this challenge&rsquo;s history.</Text>
        <AnimatedPrimaryButton accessibilityHint="Returns to the active challenge" label="Back to challenge" onPress={backToHome} reducedMotion={reducedMotion} />
      </Shell>
    );
  }

  // --- Build ---
  if (viewModel.direction === 'build' && period.target.type === 'completion_target') {
    const binary = period.target.target <= 1;

    if (displayedFact && displayedFact.kind === 'build_completion') {
      if (!viewModel.correction.available) {
        return (
          <Shell>
            <Text style={styles.phaseLabel}>CHECK IN</Text>
            <Text accessibilityRole="header" style={styles.headline}>Already recorded.</Text>
            <Text style={styles.contextLine}>{describeFact(displayedFact)} for {describePeriodTarget(period).toLowerCase()}.</Text>
            <Text style={styles.supporting}>The reporting window for this check-in is closed.</Text>
            <AnimatedPrimaryButton accessibilityHint="Returns to the active challenge" label="Back to challenge" onPress={backToHome} reducedMotion={reducedMotion} />
          </Shell>
        );
      }
      return (
        <Shell>
          <Text style={styles.phaseLabel}>CHANGE THIS CHECK-IN</Text>
          <Text accessibilityRole="header" style={styles.headline}>Currently recorded: {describeFact(displayedFact)}.</Text>
          <Text style={styles.supporting}>This changes which answer counts for {period.periodKind === 'week' ? 'this week' : 'today'}. The original check-in remains in history.</Text>
          {binary ? (
            <>
              <AnimatedPrimaryButton accessibilityHint="Corrects this check-in to done" label="Mark as done" onPress={() => submitAndTrack({ kind: 'build_completion', completions: 1 }, correctionTarget!.eventId)} reducedMotion={reducedMotion} />
              <SecondaryButton label="Mark as not done" onPress={() => submitAndTrack({ kind: 'build_completion', completions: 0 }, correctionTarget!.eventId)} />
            </>
          ) : (
            <Stepper label={`Corrected total (target ${period.target.target})`} onChange={setBuildCount} value={buildCount} />
          )}
          {!binary && <AnimatedPrimaryButton accessibilityHint="Saves the corrected total" label="Save correction" onPress={() => submitAndTrack({ kind: 'build_completion', completions: buildCount }, correctionTarget!.eventId)} reducedMotion={reducedMotion} />}
        </Shell>
      );
    }

    if (dismissedNotToday) {
      return (
        <Shell>
          <Text style={styles.phaseLabel}>CHECK IN</Text>
          <Text accessibilityRole="header" style={styles.headline}>No problem.</Text>
          <Text style={styles.supporting}>Check in after you complete it.</Text>
          <AnimatedPrimaryButton accessibilityHint="Returns to the active challenge" label="Back to challenge" onPress={backToHome} reducedMotion={reducedMotion} />
        </Shell>
      );
    }

    return (
      <Shell>
        <Text style={styles.phaseLabel}>CHECK IN</Text>
        <Text style={styles.contextLine}>{describePeriodTarget(period)}</Text>
        <Text accessibilityRole="header" style={styles.headline}>{binary ? 'Did you do it?' : 'How many so far?'}</Text>
        <Text style={styles.promise}>{viewModel.promise}</Text>
        {binary ? (
          <>
            <AnimatedPrimaryButton accessibilityHint="Records today's promise as done" label="Done" onPress={() => submitAndTrack({ kind: 'build_completion', completions: 1 })} reducedMotion={reducedMotion} />
            <SecondaryButton label="Not today" onPress={() => { void playSelectionHaptic(); setDismissedNotToday(true); }} />
          </>
        ) : (
          <>
            <Stepper label="Total completed this period" onChange={setBuildCount} value={buildCount} />
            <AnimatedPrimaryButton accessibilityHint="Reports this total for the period" label="Save total" onPress={() => submitAndTrack({ kind: 'build_completion', completions: buildCount })} reducedMotion={reducedMotion} />
          </>
        )}
      </Shell>
    );
  }

  // --- Cut back ---
  if (viewModel.direction === 'cut_back' && period.target.type === 'maximum_value') {
    const unit = period.target.measurement.unit;
    const maximum = period.target.maximum;
    const parsed = Number(cutInput.replace(',', '.'));
    const validInput = cutInput.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;

    if (displayedFact && displayedFact.kind === 'cut_back_total') {
      if (!viewModel.correction.available) {
        return (
          <Shell>
            <Text style={styles.phaseLabel}>CHECK IN</Text>
            <Text accessibilityRole="header" style={styles.headline}>Already recorded.</Text>
            <Text style={styles.contextLine}>{describeFact(displayedFact)} against a maximum of {maximum} {unit}.</Text>
            <Text style={styles.supporting}>The reporting window for this check-in is closed.</Text>
            <AnimatedPrimaryButton accessibilityHint="Returns to the active challenge" label="Back to challenge" onPress={backToHome} reducedMotion={reducedMotion} />
          </Shell>
        );
      }
      return (
        <Shell>
          <Text style={styles.phaseLabel}>CHANGE THIS CHECK-IN</Text>
          <Text accessibilityRole="header" style={styles.headline}>Currently recorded: {describeFact(displayedFact)}.</Text>
          <Text style={styles.supporting}>This changes which answer counts for this period. The original check-in remains in history.</Text>
          <NumberInput onChangeText={setCutInput} unit={unit} value={cutInput} />
          <AnimatedPrimaryButton accessibilityHint="Saves the corrected total" disabled={!validInput} label="Save correction" onPress={() => submitAndTrack({ kind: 'cut_back_total', total: parsed, unit }, correctionTarget!.eventId)} reducedMotion={reducedMotion} />
        </Shell>
      );
    }

    return (
      <Shell>
        <Text style={styles.phaseLabel}>CHECK IN</Text>
        <Text style={styles.contextLine}>{describePeriodTarget(period)}</Text>
        <Text accessibilityRole="header" style={styles.headline}>How many {unit} so far?</Text>
        <Text style={styles.promise}>{viewModel.promise}</Text>
        <NumberInput onChangeText={setCutInput} unit={unit} value={cutInput} />
        <AnimatedPrimaryButton accessibilityHint="Reports this total for the period" disabled={!validInput} label="Record total" onPress={() => submitAndTrack({ kind: 'cut_back_total', total: parsed, unit })} reducedMotion={reducedMotion} />
      </Shell>
    );
  }

  // --- Stop ---
  if (viewModel.direction === 'stop') {
    if (status.kind === 'stop_final_attestation_due') {
      if (confirmLapse) {
        return (
          <Shell>
            <Text style={styles.phaseLabel}>FINAL ANSWER</Text>
            <Text accessibilityRole="header" style={styles.headline}>Record a lapse for the full challenge?</Text>
            <Text style={styles.supporting}>This is the final answer for this challenge.</Text>
            <AnimatedPrimaryButton accessibilityHint="Confirms the final answer as a lapse" label="Confirm" onPress={() => submitAndTrack({ kind: 'stop_lapse' })} reducedMotion={reducedMotion} />
            <SecondaryButton label="Go back" onPress={() => { void playSelectionHaptic(); setConfirmLapse(false); }} />
          </Shell>
        );
      }
      return (
        <Shell>
          <Text style={styles.phaseLabel}>FINAL ANSWER</Text>
          <Text accessibilityRole="header" style={styles.headline}>Did you keep this promise for the full challenge?</Text>
          <Text style={styles.promise}>{viewModel.promise}</Text>
          <Text style={styles.supporting}>Tracking has ended. This is the final answer for this challenge.</Text>
          <AnimatedPrimaryButton accessibilityHint="Records the final answer as intact" label="Yes, I kept it" onPress={() => submitAndTrack({ kind: 'stop_intact' })} reducedMotion={reducedMotion} />
          <SecondaryButton label="No, I slipped" onPress={() => { void playSelectionHaptic(); setConfirmLapse(true); }} />
        </Shell>
      );
    }

    if (status.kind === 'stop_lapse_on_record') {
      if (!viewModel.correction.available) {
        return (
          <Shell>
            <Text style={styles.phaseLabel}>CHECK IN</Text>
            <Text accessibilityRole="header" style={styles.headline}>A lapse is on record.</Text>
            <Text style={styles.supporting}>The reporting window for this entry is closed.</Text>
            <AnimatedPrimaryButton accessibilityHint="Returns to the active challenge" label="Back to challenge" onPress={backToHome} reducedMotion={reducedMotion} />
          </Shell>
        );
      }
      return (
        <Shell>
          <Text style={styles.phaseLabel}>CHECK IN</Text>
          <Text accessibilityRole="header" style={styles.headline}>A lapse is on record.</Text>
          <Text style={styles.supporting}>If this was reported by accident, you can correct it while the reporting window is open. The original entry remains in history.</Text>
          <AnimatedPrimaryButton accessibilityHint="Corrects this lapse to still going, by accident" label="This was reported by accident" onPress={() => submitAndTrack({ kind: 'stop_intact' }, correctionTarget!.eventId)} reducedMotion={reducedMotion} />
          <SecondaryButton label="Leave it as recorded" onPress={backToHome} />
        </Shell>
      );
    }

    if (confirmLapse) {
      return (
        <Shell>
          <Text style={styles.phaseLabel}>CHECK IN</Text>
          <Text accessibilityRole="header" style={styles.headline}>Record a lapse?</Text>
          <Text style={styles.supporting}>This would affect the challenge result under the current success rule.</Text>
          <AnimatedPrimaryButton accessibilityHint="Confirms and records one lapse" label="Record lapse" onPress={() => submitAndTrack({ kind: 'stop_lapse' })} reducedMotion={reducedMotion} />
          <SecondaryButton label="Go back" onPress={() => { void playSelectionHaptic(); setConfirmLapse(false); }} />
        </Shell>
      );
    }

    return (
      <Shell>
        <Text style={styles.phaseLabel}>CHECK IN</Text>
        <Text accessibilityRole="header" style={styles.headline}>Are you still keeping it?</Text>
        <Text style={styles.promise}>{viewModel.promise}</Text>
        <Text style={styles.supporting}>Be honest. This check-in is for you. There&rsquo;s no need to do this every day — only when something changes.</Text>
        <AnimatedPrimaryButton accessibilityHint="Records the promise as still intact" label="Still going" onPress={() => submitAndTrack({ kind: 'stop_intact' })} reducedMotion={reducedMotion} />
        <SecondaryButton label="I slipped" onPress={() => { void playSelectionHaptic(); setConfirmLapse(true); }} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Text style={styles.phaseLabel}>CHECK IN</Text>
      <Text accessibilityRole="header" style={styles.headline}>Nothing to check in right now.</Text>
      <AnimatedPrimaryButton accessibilityHint="Returns to the active challenge" label="Back to challenge" onPress={backToHome} reducedMotion={reducedMotion} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <View style={styles.header}>
              <Pressable accessibilityHint="Returns to the active challenge without recording" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.wordmark}>KINWIN</Text>
            </View>
            <PrototypeTag />
            <View style={styles.main}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>{label}</Text></Pressable>;
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable accessibilityLabel="Decrease" accessibilityRole="button" onPress={() => { void playSelectionHaptic(); onChange(Math.max(0, value - 1)); }} style={styles.stepperButton}>
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable accessibilityLabel="Increase" accessibilityRole="button" onPress={() => { void playSelectionHaptic(); onChange(value + 1); }} style={styles.stepperButton}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NumberInput({ value, onChangeText, unit }: { value: string; onChangeText: (value: string) => void; unit: string }) {
  return (
    <View style={styles.inputRow}>
      <TextInput accessibilityLabel={`Current total in ${unit}`} inputMode="decimal" keyboardType="decimal-pad" onChangeText={onChangeText} placeholder="0" placeholderTextColor={theme.colors.warmGrey} style={styles.input} value={value} />
      <Text style={styles.inputUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: theme.colors.ink }, scrollContent: { flexGrow: 1 },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center' }, backButton: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, lineHeight: 35 }, wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 }, pressed: { opacity: 0.65 },
  main: { gap: 16, paddingTop: 24 }, phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  contextLine: { color: theme.colors.warmGrey, fontSize: 11, lineHeight: 17 }, headline: { color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }), fontSize: 32, lineHeight: 38 },
  promise: { borderLeftWidth: 2, borderLeftColor: theme.colors.copperBright, paddingLeft: 15, color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }), fontSize: 22, lineHeight: 28 },
  supporting: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  secondary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface }, secondaryText: { color: theme.colors.boneMuted, fontSize: 14, fontWeight: '700' },
  inputRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.copperBright, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 18 },
  input: { flex: 1, color: theme.colors.bone, fontSize: 30, paddingVertical: 12 }, inputUnit: { color: theme.colors.copperBright, fontSize: 14, fontWeight: '700', marginLeft: 6 },
  stepperRow: { gap: 10 }, stepperLabel: { color: theme.colors.boneMuted, fontSize: 13 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  stepperButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperSurface, borderRadius: theme.radius.controlled },
  stepperButtonText: { color: theme.colors.copperBright, fontSize: 22, fontWeight: '700' },
  stepperValue: { color: theme.colors.bone, fontSize: 28, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }), minWidth: 40, textAlign: 'center' },
});
