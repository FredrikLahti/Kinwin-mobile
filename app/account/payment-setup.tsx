import * as Linking from 'expo-linking';
import { Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playCommitmentHaptic, playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { readStripeConfig } from '@/lib/stripe/config';
import { useStripe, usePaymentSheet } from '@/lib/stripe/native-stripe';
import { classifyPaymentSheetPresentResult } from '@/lib/stripe/payment-sheet-outcome';
import { derivePaymentSetupAvailability } from '@/lib/stripe/payment-setup-availability';
import { pollForAuthorization } from '@/lib/stripe/poll-authorization';
import { fetchPendingCommitment, PendingCommitment } from '@/lib/supabase/challenge-repository';
import { createConsequenceSetupIntent } from '@/lib/supabase/consequence-setup-repository';

type SetupMode = 'initial' | 'replace';

// 'presenting' and 'verifying' are only ever reached through startPaymentSheet
// below — never set directly from a re-fetch — so a background refetch can
// never interrupt an in-flight card step or verification. PaymentSheet
// itself is a native modal that blocks the screen underneath while it is
// up, so commitment cancellation (which lives only on the pending-commitment
// screen) is structurally unreachable during 'presenting' — there is no
// separate flag to manage for that requirement. There is no 'ready' state:
// once authorized, this screen hands off to /account/pending-commitment
// immediately rather than showing its own confirmation — saving a card is
// an infrastructure step, not a moment to linger on.
type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'unavailable'; readonly reason: 'not_configured' | 'native_required'; readonly commitment: PendingCommitment }
  | { readonly kind: 'consent'; readonly commitment: PendingCommitment; readonly mode: SetupMode }
  | { readonly kind: 'presenting'; readonly commitment: PendingCommitment; readonly mode: SetupMode }
  | { readonly kind: 'verifying'; readonly commitment: PendingCommitment; readonly timedOut: boolean; readonly checking: boolean }
  | { readonly kind: 'error'; readonly commitment: PendingCommitment | null; readonly message: string };

export default function PaymentSetupScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const { handleURLCallback } = useStripe();
  // Only relevant when a card is already saved: opened from pending-commitment's
  // "Change payment method" link, which is the one case that should go straight
  // to consent instead of being redirected away as already-done.
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [acknowledged, setAcknowledged] = useState(false);
  const activeRef = useRef(true);
  const returnURL = useMemo(() => Linking.createURL('account/payment-setup'), []);

  const availability = useMemo(
    () => derivePaymentSetupAvailability({ isWeb: Platform.OS === 'web', stripeConfigured: readStripeConfig() !== null }),
    [],
  );

  const load = useCallback(async () => {
    if (!user) return;
    setState({ kind: 'loading' });
    const result = await fetchPendingCommitment(user.id);
    if (!activeRef.current) return;
    if (!result.ok) {
      const message = 'message' in result ? result.message : 'Sign in to continue payment setup.';
      setState({ kind: 'error', commitment: null, message });
      return;
    }
    if (!result.commitment) {
      setState({ kind: 'none' });
      return;
    }
    setAcknowledged(false);
    if (result.commitment.authorizationStatus === 'authorized' && modeParam !== 'replace') {
      router.replace('/account/pending-commitment' as Href);
      return;
    }
    if (availability.kind !== 'available') {
      setState({ kind: 'unavailable', reason: availability.reason, commitment: result.commitment });
    } else {
      setState({ kind: 'consent', commitment: result.commitment, mode: modeParam === 'replace' ? 'replace' : 'initial' });
    }
  }, [availability, modeParam, router, user]);

  // Re-derives from the server every time this screen gains focus — reopening
  // after backgrounding, navigating away and back, or a delayed webhook must
  // never show a stale local claim. Native PaymentSheet's own presentation
  // does not change React Navigation focus, so this never fires mid-sheet.
  useFocusEffect(useCallback(() => {
    activeRef.current = true;
    void load();
    return () => { activeRef.current = false; };
  }, [load]));

  // Required for card authentication/redirect return flows (see
  // docs/PAYMENT_SETUP.md); a no-op on web, where useStripe() is the
  // native-stripe.web.tsx stub.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => { void handleURLCallback(url); });
    return () => subscription.remove();
  }, [handleURLCallback]);

  const runVerificationPoll = useCallback(async () => {
    const outcome = await pollForAuthorization(
      async () => {
        if (!user) return { authorized: false };
        const result = await fetchPendingCommitment(user.id);
        if (!activeRef.current) return { authorized: true };
        if (!result.ok) return { authorized: false };
        if (!result.commitment) {
          setState({ kind: 'none' });
          return { authorized: true };
        }
        if (result.commitment.authorizationStatus === 'authorized') {
          router.replace('/account/pending-commitment' as Href);
          return { authorized: true };
        }
        const commitment = result.commitment;
        setState((previous) => (previous.kind === 'verifying' ? { ...previous, commitment } : previous));
        return { authorized: false };
      },
      { signal: { get aborted() { return !activeRef.current; } } },
    );
    if (outcome === 'timeout' && activeRef.current) {
      setState((previous) => (previous.kind === 'verifying' ? { ...previous, timedOut: true } : previous));
    }
  }, [router, user]);

  const startPaymentSheet = useCallback(async (commitment: PendingCommitment, mode: SetupMode) => {
    if (!user) return;
    setState({ kind: 'presenting', commitment, mode });

    const setupResult = await createConsequenceSetupIntent(commitment.challengeId, user.id);
    if (!activeRef.current) return;
    if (!setupResult.ok) {
      setState({ kind: 'error', commitment, message: setupResult.message });
      return;
    }

    const initResult = await initPaymentSheet({
      setupIntentClientSecret: setupResult.clientSecret,
      merchantDisplayName: 'Kinwin',
      returnURL,
      allowsDelayedPaymentMethods: false,
    });
    if (!activeRef.current) return;
    if (initResult.error) {
      setState({ kind: 'error', commitment, message: 'Could not prepare the payment form. Try again.' });
      return;
    }

    const presentResult = await presentPaymentSheet();
    if (!activeRef.current) return;
    const outcome = classifyPaymentSheetPresentResult(presentResult.error);

    if (outcome === 'canceled') {
      void playSelectionHaptic();
      setState({ kind: 'consent', commitment, mode });
      return;
    }
    if (outcome === 'failed') {
      setState({ kind: 'error', commitment, message: presentResult.error?.message || 'The payment step could not be completed. Try again.' });
      return;
    }

    void playCommitmentHaptic();
    setState({ kind: 'verifying', commitment, timedOut: false, checking: false });
    void runVerificationPoll();
  }, [initPaymentSheet, presentPaymentSheet, returnURL, runVerificationPoll, user]);

  const toggleAcknowledged = () => {
    void playSelectionHaptic();
    setAcknowledged((current) => !current);
  };

  const continueToPaymentSheet = () => {
    if (state.kind !== 'consent' || !acknowledged || availability.kind !== 'available') return;
    void playImportantHaptic();
    void startPaymentSheet(state.commitment, state.mode);
  };

  const checkAgain = useCallback(async () => {
    if (state.kind !== 'verifying' || !user) return;
    setState((previous) => (previous.kind === 'verifying' ? { ...previous, checking: true } : previous));
    const result = await fetchPendingCommitment(user.id);
    if (!activeRef.current) return;
    if (!result.ok) {
      setState((previous) => (previous.kind === 'verifying' ? { ...previous, checking: false } : previous));
      return;
    }
    if (!result.commitment) {
      setState({ kind: 'none' });
      return;
    }
    if (result.commitment.authorizationStatus === 'authorized') {
      router.replace('/account/pending-commitment' as Href);
      return;
    }
    setState({ kind: 'verifying', commitment: result.commitment, timedOut: true, checking: false });
  }, [router, state, user]);

  const retry = () => {
    void playSelectionHaptic();
    void load();
  };

  const goBack = () => {
    void playSelectionHaptic();
    router.back();
  };

  const backToCommitment = () => {
    void playImportantHaptic();
    router.replace('/account/pending-commitment' as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Returns to your pending commitment"
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

          <Text accessibilityRole="header" style={styles.headline}>Add payment method</Text>

          {state.kind === 'loading' && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Checking your commitment…</Text>
          )}

          {state.kind === 'none' && (
            <View style={styles.section}>
              <Text style={styles.body}>
                This commitment could not be found. It may have already been canceled.
              </Text>
              <Pressable
                accessibilityHint="Returns to your pending commitment"
                accessibilityRole="button"
                hitSlop={6}
                onPress={backToCommitment}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>Back to your commitment</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'consent' && (
            <View style={styles.section}>
              <Text style={styles.stakeLine}>
                {state.commitment.stakeMinorUnits > 0
                  ? `$${(state.commitment.stakeMinorUnits / 100).toLocaleString('en-US')} may be charged to this card if the challenge fails.`
                  : 'This card may be charged if the challenge fails.'}
              </Text>
              <DisclosureList />

              <Pressable
                accessibilityLabel="I understand and accept how my saved card may be used"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acknowledged }}
                hitSlop={3}
                onPress={toggleAcknowledged}
                style={({ pressed }) => [styles.acknowledgement, acknowledged && styles.acknowledgementSelected, pressed && styles.acknowledgementPressed]}
              >
                <View aria-hidden style={[styles.acknowledgementMark, acknowledged && styles.acknowledgementMarkSelected]}>
                  <Text style={styles.acknowledgementCheck}>{acknowledged ? '✓' : ''}</Text>
                </View>
                <Text style={styles.acknowledgementText}>I understand and accept this.</Text>
              </Pressable>

              <PrimaryButtonV2
                accessibilityHint="Opens Stripe's secure payment form to save a card"
                disabled={!acknowledged}
                label={state.mode === 'replace' ? 'Update card' : 'Continue to Stripe'}
                onPress={continueToPaymentSheet}
                reducedMotion={reducedMotion}
              />
            </View>
          )}

          {state.kind === 'unavailable' && (
            <View style={styles.section}>
              <Text style={styles.errorText}>
                {state.reason === 'native_required'
                  ? 'Payment setup requires the Kinwin app on a phone or tablet. This screen is shown for visual review only. The payment form cannot open here.'
                  : 'Payment setup is not configured in this build yet. The rest of Kinwin remains usable. Try again once it is configured.'}
              </Text>
            </View>
          )}

          {state.kind === 'presenting' && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Preparing Stripe&apos;s secure payment form…</Text>
          )}

          {state.kind === 'verifying' && (
            <View style={styles.section}>
              <Text accessibilityLiveRegion="polite" style={styles.body}>
                {state.timedOut
                  ? 'Still verifying with Stripe. This can take a little longer than usual. You can check again, or leave and come back later. Your progress is saved.'
                  : 'Confirming your card was saved. This usually takes a few seconds.'}
              </Text>
              {state.timedOut && (
                <Pressable
                  accessibilityHint="Checks the server again for confirmation"
                  accessibilityRole="button"
                  disabled={state.checking}
                  hitSlop={6}
                  onPress={() => void checkAgain()}
                  style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
                >
                  <Text style={styles.textButtonLabel}>{state.checking ? 'Checking…' : 'Check again'}</Text>
                </Pressable>
              )}
            </View>
          )}

          {state.kind === 'error' && (
            <View style={styles.section}>
              <Text style={styles.errorText}>{state.message}</Text>
              <Pressable
                accessibilityHint="Tries again"
                accessibilityRole="button"
                hitSlop={6}
                onPress={retry}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>Retry</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// The points docs/PRODUCT_DECISIONS.md's "Consequence payment setup" section
// requires the consent screen to convey — plain product copy, not approved legal
// wording (see that section's own caveat: final consent copy requires legal review
// before shipping).
const DISCLOSURE_POINTS: readonly string[] = [
  'No money is charged now.',
  'Your card is saved securely with Stripe.',
  'A charge can happen automatically, even while you’re not using Kinwin.',
  'This card is used only for this commitment.',
];

function DisclosureList() {
  return (
    <View style={styles.disclosureList}>
      {DISCLOSURE_POINTS.map((point) => (
        <View key={point} style={styles.disclosureRow}>
          <View aria-hidden style={styles.disclosureMark} />
          <Text style={styles.disclosureText}>{point}</Text>
        </View>
      ))}
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
  section: { gap: 16 },
  textButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  stakeLine: { color: theme.colors.ivory, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  disclosureList: { gap: 9 },
  disclosureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  disclosureMark: { width: 4, height: 4, marginTop: 7, borderRadius: 2, backgroundColor: theme.colors.crimson },
  disclosureText: { flex: 1, color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  acknowledgement: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.controlled, paddingHorizontal: 15, paddingVertical: 12, gap: 12,
  },
  acknowledgementSelected: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.surfaceRaised },
  acknowledgementPressed: { backgroundColor: theme.colors.surfaceFocused },
  acknowledgementMark: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: 4, backgroundColor: theme.colors.ink,
  },
  acknowledgementMarkSelected: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep },
  acknowledgementCheck: { color: theme.colors.ivory, fontSize: 14, fontWeight: '800' },
  acknowledgementText: { flex: 1, color: theme.colors.ivory, fontSize: 13, fontWeight: '600' },
});
