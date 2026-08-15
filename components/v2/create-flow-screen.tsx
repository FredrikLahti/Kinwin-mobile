import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { CreateProgressV2 } from '@/components/v2/create-progress';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useCreationSessionAutosave } from '@/hooks/use-creation-session-autosave';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { clearCreationSession, planExitAttempt } from '@/lib/challenge-creation/creation-session';
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
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const { status: authStatus, user } = useAuth();
  const { flush, meaningfulProgress } = useCreationSessionAutosave();
  const [leaveSheetOpen, setLeaveSheetOpen] = useState(false);
  const [discardSheetOpen, setDiscardSheetOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [saveFailedSheetOpen, setSaveFailedSheetOpen] = useState(false);
  const [retryingSave, setRetryingSave] = useState(false);
  const [signedOutLeaveSheetOpen, setSignedOutLeaveSheetOpen] = useState(false);

  // '/' rather than '/home' directly: creation is reachable while signed
  // out (see app/_layout.tsx's AuthGate — 'create' sits outside the
  // signed-in Stack.Protected guard), and '/' already redirects a
  // signed-in user straight to '/home' itself (app/index.tsx) — so this is
  // the one exit destination that is correct regardless of auth status.
  const leaveCreation = () => router.replace('/' as Href);

  const attemptExit = async () => {
    void playSelectionHaptic();
    // Decided before any save is attempted: autosave only ever persists for
    // a signed-in user (hooks/use-creation-session-autosave.ts), so a
    // signed-out user with meaningful progress must never fall through to
    // the "your progress is saved" path below — that would be a lie.
    const plan = planExitAttempt(meaningfulProgress, authStatus === 'signed_in');
    if (plan === 'leave_immediately') {
      leaveCreation();
      return;
    }
    if (plan === 'confirm_unsaved_signed_out') {
      setSignedOutLeaveSheetOpen(true);
      return;
    }
    // The Leave sheet below promises "your progress is saved" — that must
    // be true before it says so, not merely started. Autosave already runs
    // on every change, so this is usually an instant no-op; it only
    // actually waits when a change landed in the last debounce window.
    const saved = await flush();
    if (!saved) {
      setSaveFailedSheetOpen(true);
      return;
    }
    setLeaveSheetOpen(true);
  };

  const confirmLeaveWithoutSaving = () => {
    void playImportantHaptic();
    // Told explicitly that nothing will be saved, so there is nothing
    // worth keeping in memory either — avoids bleeding partial state into
    // whatever this device does next (a later sign-in, a fresh anonymous
    // visit), consistent with how the explicit Discard path already
    // resets the draft.
    onboarding.resetDraft();
    setSignedOutLeaveSheetOpen(false);
    leaveCreation();
  };

  const retrySave = async () => {
    void playSelectionHaptic();
    setRetryingSave(true);
    const saved = await flush();
    setRetryingSave(false);
    if (saved) {
      setSaveFailedSheetOpen(false);
      setLeaveSheetOpen(true);
    }
    // Still failing: the sheet stays open so the user can retry again or
    // choose to keep editing — never silently navigate away regardless.
  };

  const confirmReturnHome = () => {
    void playSelectionHaptic();
    setLeaveSheetOpen(false);
    leaveCreation();
  };

  const openDiscardFromLeaveSheet = () => {
    void playSelectionHaptic();
    setLeaveSheetOpen(false);
    setDiscardSheetOpen(true);
  };

  const confirmDiscard = async () => {
    void playImportantHaptic();
    setDiscarding(true);
    if (authStatus === 'signed_in' && user) {
      await clearCreationSession(user.id, creationSessionStorage);
    }
    onboarding.resetDraft();
    setDiscarding(false);
    setDiscardSheetOpen(false);
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
                onPress={onBack}
                style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              >
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.wordmark}>KINWIN</Text>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.stepLabel}
              >
                {currentStep}/{totalSteps}
              </Text>
              <Pressable
                accessibilityHint="Leaves challenge setup and returns to Home"
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => void attemptExit()}
                style={({ pressed }) => [styles.exitButton, pressed && styles.exitButtonPressed]}
              >
                <Text aria-hidden style={styles.exitIcon}>✕</Text>
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

      <BottomSheetV2 onClose={() => setLeaveSheetOpen(false)} reducedMotion={reducedMotion} visible={leaveSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Leave challenge setup?</Text>
        <Text style={styles.sheetBody}>Your progress is saved. You can pick up right where you left off next time.</Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Returns to Home. Your progress stays saved."
            accessibilityRole="button"
            onPress={confirmReturnHome}
            style={({ pressed }) => [styles.primarySheetButton, pressed && styles.primarySheetButtonPressed]}
          >
            <Text style={styles.primarySheetButtonLabel}>Return home</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Closes this and continues setting up your challenge"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); setLeaveSheetOpen(false); }}
            style={({ pressed }) => [styles.secondarySheetButton, pressed && styles.secondarySheetButtonPressed]}
          >
            <Text style={styles.secondarySheetButtonLabel}>Keep editing</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Opens a confirmation to permanently discard this challenge draft instead"
            accessibilityRole="button"
            hitSlop={6}
            onPress={openDiscardFromLeaveSheet}
            style={styles.discardLink}
          >
            <Text style={styles.discardLinkText}>Discard draft instead</Text>
          </Pressable>
        </View>
      </BottomSheetV2>

      <BottomSheetV2 onClose={() => setDiscardSheetOpen(false)} reducedMotion={reducedMotion} visible={discardSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Discard this draft?</Text>
        <Text style={styles.sheetBody}>This permanently deletes everything entered so far. This can’t be undone.</Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Keeps your draft and closes this sheet"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); setDiscardSheetOpen(false); }}
            style={({ pressed }) => [styles.secondarySheetButton, pressed && styles.secondarySheetButtonPressed]}
          >
            <Text style={styles.secondarySheetButtonLabel}>Keep draft</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Permanently discards this challenge draft and returns to Home"
            accessibilityRole="button"
            disabled={discarding}
            onPress={() => void confirmDiscard()}
            style={({ pressed }) => [styles.destructiveSheetButton, pressed && styles.destructiveSheetButtonPressed]}
          >
            <Text style={styles.destructiveSheetButtonLabel}>{discarding ? 'Discarding…' : 'Discard draft'}</Text>
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
            disabled={retryingSave}
            onPress={() => void retrySave()}
            style={({ pressed }) => [styles.primarySheetButton, pressed && styles.primarySheetButtonPressed]}
          >
            <Text style={styles.primarySheetButtonLabel}>{retryingSave ? 'Retrying…' : 'Retry'}</Text>
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

      <BottomSheetV2 onClose={() => setSignedOutLeaveSheetOpen(false)} reducedMotion={reducedMotion} visible={signedOutLeaveSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Leave challenge setup?</Text>
        <Text style={styles.sheetBody}>You’re not signed in, so this progress can’t be saved if you leave.</Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Closes this and continues setting up your challenge"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); setSignedOutLeaveSheetOpen(false); }}
            style={({ pressed }) => [styles.secondarySheetButton, pressed && styles.secondarySheetButtonPressed]}
          >
            <Text style={styles.secondarySheetButtonLabel}>Keep editing</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Leaves without saving. Everything entered so far will be lost."
            accessibilityRole="button"
            onPress={confirmLeaveWithoutSaving}
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
  stepLabel: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '600' },
  exitButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginRight: -9, borderRadius: theme.radius.precise,
  },
  exitButtonPressed: { backgroundColor: theme.colors.surface },
  exitIcon: { color: theme.colors.ivoryMuted, fontSize: 16, fontWeight: '700' },
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
  discardLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  discardLinkText: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '600' },
  destructiveSheetButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    backgroundColor: '#4A1B1B',
  },
  destructiveSheetButtonPressed: { backgroundColor: '#5C2222' },
  destructiveSheetButtonLabel: { color: '#E37D6A', fontSize: 15, fontWeight: '700' },
});
