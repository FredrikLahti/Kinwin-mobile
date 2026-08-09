import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import {
  cancelPendingChallenge,
  fetchPendingCommitment,
  PendingCommitment,
} from '@/lib/supabase/challenge-repository';
import { activateChallenge } from '@/lib/supabase/active-challenge-repository';
import { calculateSuccessRule } from '@/lib/success-rule';

function formatNames(names: string[]) {
  if (names.length === 0) return 'your recipients';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// Every state a signed-in user can be in on this screen. Payment setup
// itself is a dedicated route (app/account/payment-setup.tsx), not a state
// here. Cancellation confirmation is a bottom sheet layered over 'summary',
// not a separate screen state — the underlying commitment never disappears
// while the user is deciding.
type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'summary'; readonly commitment: PendingCommitment }
  | { readonly kind: 'canceling' }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

export default function PendingCommitmentScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const onboarding = useOnboarding();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [activation, setActivation] = useState<{ status: 'idle' | 'activating' | 'error'; message?: string }>({ status: 'idle' });
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setState({ kind: 'loading' });
    const result = await fetchPendingCommitment(user.id);
    if (!result.ok) {
      const message = 'message' in result ? result.message : 'Sign in to see your commitment.';
      setState({ kind: 'error', message });
      return;
    }
    setState(result.commitment ? { kind: 'summary', commitment: result.commitment } : { kind: 'none' });
  }, [user]);

  // Refetches every time this screen gains focus (not just on first mount),
  // so returning here after payment setup or canceling elsewhere never shows
  // a stale commitment.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openPaymentSetup = () => {
    void playSelectionHaptic();
    router.push('/account/payment-setup' as Href);
  };

  const changePaymentMethod = () => {
    void playSelectionHaptic();
    router.push('/account/payment-setup?mode=replace' as Href);
  };

  // The device's own IANA timezone is the one piece of information
  // activation needs that nothing earlier in the flow has ever collected —
  // see supabase/migrations/20260811000000_full_activation.sql. The server
  // independently validates it against its own tzdata and, separately,
  // re-verifies real payment authorization before it will activate anything
  // — this call cannot itself bypass either check.
  const activate = useCallback(async (commitment: PendingCommitment) => {
    if (!user) return;
    void playImportantHaptic();
    setActivation({ status: 'activating' });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await activateChallenge(commitment.challengeId, timezone);
    if (!result.ok) {
      const message = 'message' in result ? result.message : 'Sign in to activate your challenge.';
      setActivation({ status: 'error', message });
      return;
    }
    router.replace('/home' as Href);
  }, [router, user]);

  const openCancelSheet = () => {
    void playSelectionHaptic();
    setCancelSheetOpen(true);
  };

  const confirmCancel = useCallback(async (commitment: PendingCommitment) => {
    if (!user) return;
    setCancelSheetOpen(false);
    setState({ kind: 'canceling' });
    const result = await cancelPendingChallenge(commitment.challengeId, user.id);
    if (!result.ok) {
      const message = 'message' in result ? result.message : 'Sign in to cancel your commitment.';
      setState({ kind: 'error', message });
      return;
    }
    void playImportantHaptic();
    // The commitment is gone; a fresh draft must never inherit any of its
    // fields (recipients especially — replacement is not allowed even
    // indirectly through a half-populated onboarding context).
    onboarding.resetDraft();
    setState({ kind: 'canceled' });
  }, [onboarding, user]);

  const retry = () => {
    void playSelectionHaptic();
    void load();
  };

  const startNewDraft = () => {
    void playImportantHaptic();
    onboarding.resetDraft();
    router.replace('/create/intro' as Href);
  };

  const goBack = () => {
    void playSelectionHaptic();
    router.back();
  };

  const commitment = state.kind === 'summary' ? state.commitment : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Returns to Home"
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={8}
              onPress={goBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            >
              <Text aria-hidden style={styles.backIcon}>‹</Text>
            </Pressable>
            <Text style={styles.wordmark}>KINWIN</Text>
          </View>

          <Text accessibilityRole="header" style={styles.headline}>
            {state.kind === 'canceled' ? 'Commitment canceled' : 'Your commitment'}
          </Text>

          {state.kind === 'loading' && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Checking…</Text>
          )}

          {state.kind === 'none' && (
            <View style={styles.section}>
              <Text style={styles.body}>You don&apos;t have a commitment in progress.</Text>
              <PrimaryButtonV2
                accessibilityHint="Starts a new challenge"
                label="Start a challenge"
                onPress={startNewDraft}
                reducedMotion={reducedMotion}
              />
            </View>
          )}

          {commitment && <CommitmentSummary commitment={commitment} />}

          {commitment && (
            <View style={styles.actions}>
              {commitment.authorizationStatus === 'authorized' ? (
                <>
                  <PrimaryButtonV2
                    accessibilityHint="Activates this challenge. Tracking starts today."
                    disabled={activation.status === 'activating'}
                    label={activation.status === 'activating' ? 'Activating…' : 'Activate challenge'}
                    onPress={() => void activate(commitment)}
                    reducedMotion={reducedMotion}
                  />
                  {activation.status === 'error' && (
                    <Text accessibilityLiveRegion="polite" style={styles.errorText}>{activation.message}</Text>
                  )}
                  <Pressable accessibilityHint="Opens Stripe to save a different card" accessibilityRole="button" onPress={changePaymentMethod} style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}>
                    <Text style={styles.textButtonLabel}>Change payment method</Text>
                  </Pressable>
                </>
              ) : (
                <PrimaryButtonV2
                  accessibilityHint="Opens Stripe to save a payment method"
                  label="Add payment method"
                  onPress={openPaymentSetup}
                  reducedMotion={reducedMotion}
                />
              )}
              <Pressable accessibilityHint="Cancels this commitment" accessibilityRole="button" onPress={openCancelSheet} style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}>
                <Text style={styles.dangerLink}>Cancel commitment</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'canceling' && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Canceling…</Text>
          )}

          {state.kind === 'canceled' && (
            <View style={styles.section}>
              <Text style={styles.body}>No payment was taken.</Text>
              <PrimaryButtonV2 accessibilityHint="Starts a fresh challenge" label="Start a new challenge" onPress={startNewDraft} reducedMotion={reducedMotion} />
            </View>
          )}

          {state.kind === 'error' && (
            <View style={styles.section}>
              <Text style={styles.errorText}>{state.message}</Text>
              <Pressable accessibilityHint="Tries again" accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}>
                <Text style={styles.textButtonLabel}>Retry</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      <BottomSheetV2 onClose={() => setCancelSheetOpen(false)} reducedMotion={reducedMotion} visible={cancelSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Cancel commitment?</Text>
        <Text style={styles.sheetBody}>This removes the unfinished commitment. No payment will be taken.</Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Keeps this commitment and closes this sheet"
            accessibilityRole="button"
            onPress={() => setCancelSheetOpen(false)}
            style={({ pressed }) => [styles.keepButton, pressed && styles.keepButtonPressed]}
          >
            <Text style={styles.keepButtonLabel}>Keep commitment</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Permanently cancels this commitment"
            accessibilityRole="button"
            onPress={() => commitment && void confirmCancel(commitment)}
            style={({ pressed }) => [styles.destructiveButton, pressed && styles.destructiveButtonPressed]}
          >
            <Text style={styles.destructiveButtonLabel}>Cancel commitment</Text>
          </Pressable>
        </View>
      </BottomSheetV2>
    </SafeAreaView>
  );
}

function CommitmentSummary({ commitment }: { readonly commitment: PendingCommitment }) {
  const successRule = calculateSuccessRule({
    ...commitment.draftData,
    rhythm: { ...commitment.draftData.rhythm, selectedWeekdays: [...commitment.draftData.rhythm.selectedWeekdays] },
  });
  const recipientNames = commitment.recipients.map((recipient) => recipient.displayName);
  const stakeLabel = `$${(commitment.stakeMinorUnits / 100).toLocaleString('en-US')}`;

  return (
    <View style={styles.summary}>
      <Text style={styles.goalText}>{commitment.draftData.goal}</Text>
      <Text style={styles.ruleText}>{successRule?.overall ?? successRule?.challengeSummary ?? commitment.draftData.behaviorText}</Text>
      <Text style={styles.stakeText}>{stakeLabel} → {formatNames(recipientNames)}</Text>
      <Text style={styles.paymentStatus}>
        {commitment.authorizationStatus === 'authorized' ? 'Payment method ✓' : 'Payment method not added yet'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: 26, paddingTop: 6, paddingBottom: 24, gap: 20,
  },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, marginRight: 4, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  headline: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700' },
  body: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  errorText: { color: '#E37D6A', fontSize: 14, lineHeight: 21 },
  section: { gap: 14 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  dangerLink: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '600' },
  summary: {
    borderLeftWidth: 2, borderLeftColor: theme.colors.crimson, backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.precise, paddingHorizontal: 16, paddingVertical: 14, gap: 6,
  },
  goalText: { color: theme.colors.ivory, fontSize: 18, fontWeight: '700', lineHeight: 23 },
  ruleText: { color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  stakeText: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600' },
  paymentStatus: { marginTop: 4, color: theme.colors.warmGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  actions: { gap: 12 },
  sheetTitle: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  sheetBody: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  sheetActions: { gap: 10 },
  keepButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
  },
  keepButtonPressed: { backgroundColor: theme.colors.surfaceRaised },
  keepButtonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  destructiveButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    backgroundColor: '#4A1B1B',
  },
  destructiveButtonPressed: { backgroundColor: '#5C2222' },
  destructiveButtonLabel: { color: '#E37D6A', fontSize: 15, fontWeight: '700' },
});
