import { Href, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NavigationAction } from '@react-navigation/native';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { CreateProgressV2 } from '@/components/v2/create-progress';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useCreationSessionAutosave } from '@/hooks/use-creation-session-autosave';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  clearCreationSession,
  closeCreationSessionGeneration,
  planBackLeaveAttempt,
  planExitAttempt,
} from '@/lib/challenge-creation/creation-session';
import { creationSessionStorage } from '@/lib/challenge-creation/creation-session-storage';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

type CreateFlowScreenV2Props = {
  backHint: string;
  children: ReactNode;
  currentStep: number;
  footer: ReactNode;
  headline: string;
  onBack: () => void;
  progressLabel?: string;
  supportingCopy?: string;
  totalSteps: number;
};

/**
 * Back and Save & exit are two deliberately distinct actions here, not one
 * conflated Close button:
 *
 * - Back (the chevron) only ever navigates one logical step backward. On
 *   every step except the first it is a plain, unconfirmed
 *   router-back-equivalent (see onBack). Only on the first step
 *   (currentStep === 1, i.e. Goal — the only step whose Back leaves the
 *   flow at all, given intro.tsx's router.replace when advancing) does it
 *   ever ask anything, and only when there is meaningful progress that has
 *   not already been explicitly saved (planBackLeaveAttempt). It never
 *   saves anything. This is enforced via React Navigation's `beforeRemove`
 *   event rather than the chevron's onPress alone — app/create/_layout.tsx
 *   has gestureEnabled: true, so an iOS swipe-back or Android hardware back
 *   press pops this screen without ever calling onBack directly; both of
 *   those, the tap, and any other way this screen could be removed all
 *   raise the same beforeRemove event, so intercepting only that one event
 *   is what actually covers every real exit path instead of just the one
 *   button.
 * - "Save & exit" (the compact header action) is the one explicit way to
 *   mark this session resume-eligible (savedForLater) and leave. Tapping
 *   it already IS the user's confirmation — on success it returns to Home
 *   directly, no extra "are you sure" sheet layered on top.
 *
 * Background autosave (useCreationSessionAutosave) keeps running quietly
 * under both of these and never grants eligibility on its own.
 */
export function CreateFlowScreenV2({
  backHint,
  children,
  currentStep,
  footer,
  headline,
  onBack,
  progressLabel,
  supportingCopy,
  totalSteps,
}: CreateFlowScreenV2Props) {
  const router = useRouter();
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const { status: authStatus, user } = useAuth();
  const { meaningfulProgress, saveForLater } = useCreationSessionAutosave();
  const [leaveWithoutSavingSheetOpen, setLeaveWithoutSavingSheetOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<NavigationAction | null>(null);
  const [saveFailedSheetOpen, setSaveFailedSheetOpen] = useState(false);
  const [savingAndExiting, setSavingAndExiting] = useState(false);
  const [signedOutSaveSheetOpen, setSignedOutSaveSheetOpen] = useState(false);

  // '/' rather than '/home' directly: creation is reachable while signed
  // out (see app/_layout.tsx's AuthGate — 'create' sits outside the
  // signed-in Stack.Protected guard), and '/' already redirects a
  // signed-in user straight to '/home' itself (app/index.tsx) — so this is
  // the one exit destination that is correct regardless of auth status.
  const leaveCreation = () => router.replace('/' as Href);

  // Only Goal (currentStep 1) can ever leave the creation flow via Back —
  // every later step's Back is a plain in-flow navigation to the previous
  // step. See lib/challenge-creation/steps.ts: goal is always position 1
  // regardless of challenge type.
  const isFirstStep = currentStep <= 1;

  // The single interception point for every way this screen can be
  // removed from the stack — a tap on the chevron (which just calls
  // router.back() below), an iOS swipe-back gesture, or Android's hardware
  // back button all raise this same event before the pop actually happens.
  // preventDefault() here holds the pop; confirming in the sheet below
  // replays the exact original action via navigation.dispatch so the
  // eventual removal is indistinguishable from one that was never paused.
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!isFirstStep) return;
      if (planBackLeaveAttempt(meaningfulProgress, onboarding.savedForLater) !== 'confirm_leave_without_saving') return;
      e.preventDefault();
      // No haptic here: a tap already got one from the chevron's own
      // onPress above, and a swipe/hardware-back interception matches
      // native convention by staying silent until the sheet's own
      // destructive action.
      setPendingLeaveAction(e.data.action);
      setLeaveWithoutSavingSheetOpen(true);
    });
  }, [navigation, isFirstStep, meaningfulProgress, onboarding.savedForLater]);

  const keepEditingFromLeaveWithoutSavingSheet = () => {
    void playSelectionHaptic();
    setPendingLeaveAction(null);
    setLeaveWithoutSavingSheetOpen(false);
  };

  const confirmLeaveWithoutSaving = async () => {
    void playImportantHaptic();
    setLeaveWithoutSavingSheetOpen(false);
    if (authStatus === 'signed_in' && user) {
      // Closed first, exactly like server conversion: a still-pending
      // autosave debounce timer armed a moment ago must recognize itself
      // as belonging to an already-abandoned lifecycle whenever it
      // eventually fires, not resurrect anything after this. Best-effort
      // clear — this session was never eligible in the first place (that
      // is why this sheet showed up at all), so there is nothing an
      // interrupted clear could leave behind that Home would ever offer
      // to continue; closing the generation alone already prevents a
      // stale write from mattering.
      closeCreationSessionGeneration(user.id);
      await clearCreationSession(user.id, creationSessionStorage);
    }
    onboarding.resetDraft();
    if (pendingLeaveAction) {
      // Replays the exact pop beforeRemove paused — correct regardless of
      // whether it originated from the chevron, a swipe, or the hardware
      // back button, since all three produced the same captured action.
      navigation.dispatch(pendingLeaveAction);
      setPendingLeaveAction(null);
      return;
    }
    onBack();
  };

  const attemptSaveAndExit = async () => {
    void playSelectionHaptic();
    // Decided before any save is attempted: autosave only ever persists
    // for a signed-in user (hooks/use-creation-session-autosave.ts), so a
    // signed-out user with meaningful progress must never fall through to
    // a "your progress is saved" outcome — that would be a lie.
    const plan = planExitAttempt(meaningfulProgress, authStatus === 'signed_in');
    if (plan === 'leave_immediately') {
      leaveCreation();
      return;
    }
    if (plan === 'confirm_unsaved_signed_out') {
      setSignedOutSaveSheetOpen(true);
      return;
    }
    setSavingAndExiting(true);
    const saved = await saveForLater();
    setSavingAndExiting(false);
    if (!saved) {
      setSaveFailedSheetOpen(true);
      return;
    }
    // Tapping "Save & exit" already was the explicit confirmation — once
    // the save has verifiably succeeded there is nothing further to ask.
    leaveCreation();
  };

  const retrySaveAndExit = async () => {
    void playSelectionHaptic();
    setSavingAndExiting(true);
    const saved = await saveForLater();
    setSavingAndExiting(false);
    if (saved) {
      setSaveFailedSheetOpen(false);
      leaveCreation();
    }
    // Still failing: the sheet stays open so the user can retry again or
    // choose to keep editing — never silently navigate away regardless.
  };

  const confirmLeaveWithoutSavingSignedOut = () => {
    void playImportantHaptic();
    // Told explicitly that nothing will be saved, so there is nothing
    // worth keeping in memory either — avoids bleeding partial state into
    // whatever this device does next (a later sign-in, a fresh anonymous
    // visit). Nothing to clear from storage: a signed-out session was
    // never written there in the first place.
    onboarding.resetDraft();
    setSignedOutSaveSheetOpen(false);
    leaveCreation();
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoidingView}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Pressable
                accessibilityHint={backHint}
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => { void playSelectionHaptic(); onBack(); }}
                style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              >
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text numberOfLines={1} style={styles.wordmark}>KINWIN</Text>
              <Pressable
                accessibilityHint="Saves this challenge so you can continue it later, and returns to Home"
                accessibilityLabel="Save and exit"
                accessibilityRole="button"
                disabled={savingAndExiting}
                hitSlop={8}
                onPress={() => void attemptSaveAndExit()}
                style={({ pressed }) => [styles.saveExitButton, pressed && styles.saveExitButtonPressed]}
              >
                <Text numberOfLines={1} style={styles.saveExitLabel}>{savingAndExiting ? 'Saving…' : 'Save & exit'}</Text>
              </Pressable>
            </View>

            <CreateProgressV2 accessibilityLabel={progressLabel} currentStep={currentStep} totalSteps={totalSteps} />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text accessibilityRole="header" style={styles.headline}>{headline}</Text>
                {supportingCopy && <Text style={styles.supportingCopy}>{supportingCopy}</Text>}
              </View>
              {children}
            </View>
          </View>
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>

      <BottomSheetV2 onClose={() => setLeaveWithoutSavingSheetOpen(false)} reducedMotion={reducedMotion} visible={leaveWithoutSavingSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Leave without saving?</Text>
        <Text style={styles.sheetBody}>Your unfinished challenge won’t be available to continue later.</Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Closes this and continues setting up your challenge"
            accessibilityRole="button"
            onPress={keepEditingFromLeaveWithoutSavingSheet}
            style={({ pressed }) => [styles.secondarySheetButton, pressed && styles.secondarySheetButtonPressed]}
          >
            <Text style={styles.secondarySheetButtonLabel}>Keep editing</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Leaves without saving. This challenge will not be available to continue later."
            accessibilityRole="button"
            onPress={() => void confirmLeaveWithoutSaving()}
            style={({ pressed }) => [styles.destructiveSheetButton, pressed && styles.destructiveSheetButtonPressed]}
          >
            <Text style={styles.destructiveSheetButtonLabel}>Leave without saving</Text>
          </Pressable>
        </View>
      </BottomSheetV2>

      <BottomSheetV2 onClose={() => setSaveFailedSheetOpen(false)} reducedMotion={reducedMotion} visible={saveFailedSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Could not save your progress</Text>
        <Text style={styles.sheetBody}>Kinwin couldn’t save your progress. Try again before leaving so nothing you entered is lost.</Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Tries saving your progress again"
            accessibilityRole="button"
            disabled={savingAndExiting}
            onPress={() => void retrySaveAndExit()}
            style={({ pressed }) => [styles.primarySheetButton, pressed && styles.primarySheetButtonPressed]}
          >
            <Text style={styles.primarySheetButtonLabel}>{savingAndExiting ? 'Retrying…' : 'Retry'}</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Closes this and continues setting up your challenge without leaving"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); setSaveFailedSheetOpen(false); }}
            style={({ pressed }) => [styles.secondarySheetButton, pressed && styles.secondarySheetButtonPressed]}
          >
            <Text style={styles.secondarySheetButtonLabel}>Keep editing</Text>
          </Pressable>
        </View>
      </BottomSheetV2>

      <BottomSheetV2 onClose={() => setSignedOutSaveSheetOpen(false)} reducedMotion={reducedMotion} visible={signedOutSaveSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Leave challenge setup?</Text>
        <Text style={styles.sheetBody}>You’re not signed in, so this progress can’t be saved if you leave.</Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Closes this and continues setting up your challenge"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); setSignedOutSaveSheetOpen(false); }}
            style={({ pressed }) => [styles.secondarySheetButton, pressed && styles.secondarySheetButtonPressed]}
          >
            <Text style={styles.secondarySheetButtonLabel}>Keep editing</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Leaves without saving. Everything entered so far will be lost."
            accessibilityRole="button"
            onPress={confirmLeaveWithoutSavingSignedOut}
            style={({ pressed }) => [styles.destructiveSheetButton, pressed && styles.destructiveSheetButtonPressed]}
          >
            <Text style={styles.destructiveSheetButtonLabel}>Leave without saving</Text>
          </Pressable>
        </View>
      </BottomSheetV2>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  keyboardAvoidingView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 6, paddingBottom: theme.spacing.small,
  },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  wordmark: { flex: 1, color: theme.colors.ivory, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  saveExitButton: {
    minHeight: 44, maxWidth: 130, alignItems: 'flex-end', justifyContent: 'center',
    paddingHorizontal: 4, marginRight: -4,
  },
  saveExitButtonPressed: { opacity: 0.65 },
  saveExitLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  main: { gap: 22, paddingTop: 18 },
  intro: { gap: 8 },
  headline: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700', lineHeight: 32 },
  supportingCopy: { color: theme.colors.ivoryMuted, fontSize: 15, lineHeight: 22 },
  footer: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 10, paddingBottom: theme.spacing.small,
  },
  sheetTitle: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  sheetBody: { marginTop: 8, color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  sheetActions: { marginTop: 20, gap: 10 },
  primarySheetButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.oxblood,
  },
  primarySheetButtonPressed: { backgroundColor: theme.colors.oxbloodDeep },
  primarySheetButtonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  secondarySheetButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
  },
  secondarySheetButtonPressed: { backgroundColor: theme.colors.surfaceRaised },
  secondarySheetButtonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  destructiveSheetButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    backgroundColor: '#4A1B1B',
  },
  destructiveSheetButtonPressed: { backgroundColor: '#5C2222' },
  destructiveSheetButtonLabel: { color: '#E37D6A', fontSize: 15, fontWeight: '700' },
});
