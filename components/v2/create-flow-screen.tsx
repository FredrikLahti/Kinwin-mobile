import { Href, useNavigation, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePreventRemove, type NavigationAction } from '@react-navigation/native';

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
  planExitAttempt,
} from '@/lib/challenge-creation/creation-session';
import { creationSessionStorage } from '@/lib/challenge-creation/creation-session-storage';
import { classifyCreationRemovalAction, shouldPreventCreationRemoval } from '@/lib/challenge-creation/navigation-action';
import { resolvePreviousCreationRoute } from '@/lib/challenge-creation/steps';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

/**
 * A decision that classifyCreationRemovalAction resolved to 'allow' or
 * 'redirect' while native-stack removal protection (usePreventRemove) was
 * active for this screen — the underlying prevented action, or the logical
 * route to redirect to instead, replayed on the next render once the
 * deferred effect below has actually turned protection off. See the
 * `usePreventRemove` call for why this can never fire synchronously inside
 * the prevented callback itself.
 */
type PendingReplay = { kind: 'allow'; action: NavigationAction } | { kind: 'redirect'; route: string };

type CreateFlowScreenV2Props = {
  backHint: string;
  children: ReactNode;
  currentStep: number;
  footer: ReactNode;
  headline: string;
  onBack: () => void;
  /**
   * True while a server request this screen started (Review's
   * saving/preparing) is in flight. Blocks user-initiated Back (header
   * tap, gesture, hardware button) and disables Save & exit, but never
   * blocks an intentional programmatic transition the app itself makes
   * once that request resolves (Review's own advanceToShare, a
   * pending-commitment redirect) — those are a different action type
   * entirely, not a Back, so the lock never reaches them.
   */
  navigationLocked?: boolean;
  progressLabel?: string;
  supportingCopy?: string;
  totalSteps: number;
};

/**
 * Back and Save & exit are two deliberately distinct actions here, not one
 * conflated Close button:
 *
 * - Back only ever navigates one logical creation step backward, defined
 *   by the actual challenge-type route sequence
 *   (resolvePreviousCreationRoute), not by whatever happens to be in the
 *   native navigation stack — a session resumed mid-flow (Home pushing
 *   straight to e.g. /create/frequency) never pushed the intermediate
 *   screens at all, so a plain pop there would go straight to Home. It
 *   never saves anything. Only when resolvePreviousCreationRoute returns
 *   null (Goal — the one real creation → Home boundary) does Back ever
 *   ask anything, and only when there is unsaved work relative to the
 *   explicit checkpoint (planBackLeaveAttempt). This is all enforced via
 *   React Navigation's `beforeRemove` event rather than the chevron's
 *   onPress alone — app/create/_layout.tsx has gestureEnabled: true, so an
 *   iOS swipe-back or Android hardware back press pops this screen
 *   without ever calling onBack directly; the tap, the gesture, and the
 *   hardware button all raise the same beforeRemove event, so
 *   intercepting only that one event is what actually covers every real
 *   exit path — and every mid-flow redirect — instead of just the one
 *   button.
 * - "Save & exit" (the compact header action) is the one explicit way to
 *   commit the current fields as the checkpoint Continue will later
 *   restore. Tapping it already IS the user's confirmation — on success
 *   it returns to Home directly, no extra "are you sure" sheet layered on
 *   top.
 *
 * Background autosave (useCreationSessionAutosave) keeps the crash-
 * recovery "working" state moving under both of these but never touches
 * the checkpoint on its own.
 */
export function CreateFlowScreenV2({
  backHint,
  children,
  currentStep,
  footer,
  headline,
  navigationLocked = false,
  onBack,
  progressLabel,
  supportingCopy,
  totalSteps,
}: CreateFlowScreenV2Props) {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const { status: authStatus, user } = useAuth();
  const { fields, meaningfulProgress, saveCheckpoint } = useCreationSessionAutosave();
  const [leaveWithoutSavingSheetOpen, setLeaveWithoutSavingSheetOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<NavigationAction | null>(null);
  const [pendingReplay, setPendingReplay] = useState<PendingReplay | null>(null);
  const [saveFailedSheetOpen, setSaveFailedSheetOpen] = useState(false);
  const [savingAndExiting, setSavingAndExiting] = useState(false);
  const [signedOutSaveSheetOpen, setSignedOutSaveSheetOpen] = useState(false);

  const checkpointFields = onboarding.checkpoint?.fields ?? null;
  const hasCheckpoint = onboarding.checkpoint !== null;

  // '/' rather than '/home' directly: creation is reachable while signed
  // out (see app/_layout.tsx's AuthGate — 'create' sits outside the
  // signed-in Stack.Protected guard), and '/' already redirects a
  // signed-in user straight to '/home' itself (app/index.tsx) — so this is
  // the one exit destination that is correct regardless of auth status.
  const leaveCreation = () => router.replace('/' as Href);

  // Computed from the actual challenge-type route sequence, not from
  // currentStep or the native stack — null exactly at Goal (and for any
  // unrecognized route), the one real creation → Home boundary.
  const previousCreationRoute = resolvePreviousCreationRoute(pathname, onboarding.behaviorDirection);

  // index 0 in this navigator means there's no real previous /create/*
  // entry to pop to — exactly what a session resumed mid-flow looks like,
  // since Home pushes straight to the target route without the
  // intermediate screens ever having been pushed. When the stack does have
  // a genuine previous entry — the user actually stepped forward to get
  // here — the native pop already lands on the right screen with its usual
  // back animation intact, so no protection is needed at all.
  const navigationState = navigation.getState();
  const nativeStackHasPreviousEntry = Boolean(navigationState && navigationState.index !== 0);

  // `usePreventRemove` (not a raw navigation.addListener('beforeRemove'))
  // is what actually makes this reach native: it registers this screen in
  // the shared PreventRemoveContext that native-stack's
  // NativeStackView.native.tsx reads to set `preventNativeDismiss` on iOS
  // *before* a swipe gesture even starts. A raw beforeRemove listener can
  // still call e.preventDefault() to stop the JS-side state update after
  // the fact, but never tells native in advance that this route may need
  // to refuse a swipe — leaving iOS's own dismiss-then-snap-back animation
  // to play out regardless. Android hardware back and the header
  // chevron's tap both dispatch a normal action through the same JS
  // beforeRemove path either way, so they're covered the same as before.
  //
  // Whether protection is armed at all — independent of any specific
  // action — is `shouldPreventCreationRemoval`'s job; it mirrors
  // classifyCreationRemovalAction's own redirect/confirm conditions minus
  // the action-type gate, since native needs to know this before any
  // particular action exists to classify.
  const protectionNeeded = shouldPreventCreationRemoval({
    checkpointFields,
    currentFields: fields,
    nativeStackHasPreviousEntry,
    navigationLocked,
    previousCreationRoute,
  });

  // `pendingReplay !== null` forces protection off for exactly one render.
  // Once the callback below decides an already-prevented action should
  // actually proceed (an intentional REPLACE) or be redirected elsewhere,
  // that can never be carried out by re-dispatching synchronously inside
  // this same prevented callback: usePreventRemove's own internal listener
  // reads its `preventRemove` argument from this render's closure, which
  // only ever updates once a full render has actually committed — a
  // synchronous re-dispatch would see the identical still-true value and
  // prevent it right back, recursing forever. Storing the decision in
  // state and carrying it out from the effect below instead guarantees a
  // real render happens first, with protection now off, before the actual
  // dispatch/replace runs — the same reason React Navigation's own
  // documented "confirm, then replay" pattern always defers its replay to
  // a later render rather than doing it inline.
  usePreventRemove(protectionNeeded && pendingReplay === null, ({ data }) => {
    const decision = classifyCreationRemovalAction({
      action: data.action,
      checkpointFields,
      currentFields: fields,
      nativeStackHasPreviousEntry,
      navigationLocked,
      previousCreationRoute,
    });
    if (decision.kind === 'blocked') return;
    if (decision.kind === 'allow') {
      setPendingReplay({ kind: 'allow', action: data.action });
      return;
    }
    if (decision.kind === 'redirect') {
      setPendingReplay({ kind: 'redirect', route: decision.route });
      return;
    }
    // decision.kind === 'confirm_leave_without_saving'. No haptic here: a
    // tap already got one from the chevron's own onPress above, and a
    // swipe/hardware-back interception matches native convention by
    // staying silent until the sheet's own destructive action.
    setPendingLeaveAction(data.action);
    setLeaveWithoutSavingSheetOpen(true);
  });

  useEffect(() => {
    if (!pendingReplay) return;
    if (pendingReplay.kind === 'allow') {
      navigation.dispatch(pendingReplay.action);
    } else {
      router.replace(pendingReplay.route as Href);
    }
    setPendingReplay(null);
  }, [pendingReplay, navigation, router]);

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
      // eventually fires, not resurrect anything after this.
      closeCreationSessionGeneration(user.id);
      if (!hasCheckpoint) {
        // Nothing was ever explicitly saved for this session — best-effort
        // clear so no stray working-only snapshot lingers.
        await clearCreationSession(user.id, creationSessionStorage);
      }
      // Else: an explicit checkpoint already exists and must survive this
      // untouched — closing the generation above is already enough to
      // stop any further stale working write from mattering; the
      // checkpoint itself is never touched by this path, so Continue
      // still restores it exactly as it was before this abandoned edit.
    }
    onboarding.resetDraft();
    if (pendingLeaveAction) {
      // Replays the exact pop beforeRemove paused — correct regardless of
      // whether it originated from the chevron, a swipe, or the hardware
      // back button, since all three produced the same captured action.
      // No suppression flag needed here: resetDraft() above already
      // cleared both the live fields and the checkpoint, so
      // shouldPreventCreationRemoval's own Goal-boundary check
      // (planBackLeaveAttempt against the now-reset fields) already
      // evaluates to "nothing unsaved" by the time this dispatch reaches
      // usePreventRemove — protection is genuinely off, not merely
      // sidestepped, so this can never re-trigger the same confirmation.
      navigation.dispatch(pendingLeaveAction);
      setPendingLeaveAction(null);
      return;
    }
    onBack();
  };

  const attemptSaveAndExit = async () => {
    // Defense in depth: the Pressable is already disabled while locked, but
    // a tap that started just before the lock landed could still reach
    // here — never let Save & exit start while Review's server request is
    // in flight.
    if (navigationLocked) return;
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
    const saved = await saveCheckpoint();
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
    const saved = await saveCheckpoint();
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
                accessibilityState={{ disabled: navigationLocked }}
                disabled={navigationLocked}
                hitSlop={8}
                onPress={() => { void playSelectionHaptic(); onBack(); }}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.backButtonPressed,
                  navigationLocked && styles.backButtonDisabled,
                ]}
              >
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text numberOfLines={1} style={styles.wordmark}>KINWIN</Text>
              <Pressable
                accessibilityHint="Saves this challenge so you can continue it later, and returns to Home"
                accessibilityLabel="Save and exit"
                accessibilityRole="button"
                accessibilityState={{ disabled: savingAndExiting || navigationLocked }}
                disabled={savingAndExiting || navigationLocked}
                hitSlop={8}
                onPress={() => void attemptSaveAndExit()}
                style={({ pressed }) => [
                  styles.saveExitButton,
                  pressed && styles.saveExitButtonPressed,
                  navigationLocked && styles.saveExitButtonDisabled,
                ]}
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
        <Text accessibilityRole="header" style={styles.sheetTitle}>
          {hasCheckpoint ? 'Leave without saving changes?' : 'Leave without saving?'}
        </Text>
        <Text style={styles.sheetBody}>
          {hasCheckpoint
            ? 'Your last saved version will still be available.'
            : 'Your unfinished challenge won’t be available to continue later.'}
        </Text>
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
            accessibilityHint={
              hasCheckpoint
                ? 'Discards changes made since your last save. Your last saved version stays available to continue.'
                : 'Leaves without saving. This challenge will not be available to continue later.'
            }
            accessibilityRole="button"
            onPress={() => void confirmLeaveWithoutSaving()}
            style={({ pressed }) => [styles.destructiveSheetButton, pressed && styles.destructiveSheetButtonPressed]}
          >
            <Text style={styles.destructiveSheetButtonLabel}>
              {hasCheckpoint ? 'Leave without saving changes' : 'Leave without saving'}
            </Text>
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
  backButtonDisabled: { opacity: 0.35 },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  wordmark: { flex: 1, color: theme.colors.ivory, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  saveExitButton: {
    minHeight: 44, maxWidth: 130, alignItems: 'flex-end', justifyContent: 'center',
    paddingHorizontal: 4, marginRight: -4,
  },
  saveExitButtonPressed: { opacity: 0.65 },
  saveExitButtonDisabled: { opacity: 0.35 },
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
