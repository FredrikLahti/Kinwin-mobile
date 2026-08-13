// Client path for the existing server-side card-replacement recovery
// contract (supabase/functions/create-consequence-setup-intent/index.ts's
// automatic recovery fallback, and
// supabase/migrations/20260901000000_owner_payment_recovery.sql). This
// screen only ever prepares and saves a new payment method through the same
// real Stripe SetupIntent/PaymentSheet path payment-setup.tsx uses — it
// never charges anything and never claims the consequence is paid. The
// webhook-driven server RPCs remain the sole source of truth for whether
// the challenge's payment obligation is actually resolved; this screen only
// waits for get_owner_payment_status to stop reporting 'needs_attention'.
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
import { createConsequenceSetupIntent } from '@/lib/supabase/consequence-setup-repository';
import { fetchOwnerPaymentStatus } from '@/lib/supabase/payment-recovery-repository';

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_needed' }
  | { readonly kind: 'unavailable'; readonly reason: 'not_configured' | 'native_required' }
  | { readonly kind: 'consent' }
  | { readonly kind: 'presenting' }
  | { readonly kind: 'verifying'; readonly timedOut: boolean; readonly checking: boolean }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly message: string };

function oneParam(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }

export default function PaymentRecoveryScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const { handleURLCallback } = useStripe();
  const params = useLocalSearchParams<{ challengeId?: string | string[]; returnTo?: string | string[] }>();
  const challengeId = oneParam(params.challengeId);
  const returnTo = oneParam(params.returnTo) || (challengeId ? `/home/result?id=${challengeId}` : '/home');

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [acknowledged, setAcknowledged] = useState(false);
  const activeRef = useRef(true);
  const returnURL = useMemo(() => Linking.createURL('account/payment-recovery'), []);

  const availability = useMemo(
    () => derivePaymentSetupAvailability({ isWeb: Platform.OS === 'web', stripeConfigured: readStripeConfig() !== null }),
    [],
  );

  const load = useCallback(async () => {
    if (!user || !challengeId) { setState({ kind: 'not_needed' }); return; }
    setState({ kind: 'loading' });
    const result = await fetchOwnerPaymentStatus(challengeId);
    if (!activeRef.current) return;
    if (!result.ok) { setState({ kind: 'error', message: 'Could not check your payment status. Try again.' }); return; }
    if (result.value.state !== 'needs_attention') { setState({ kind: 'not_needed' }); return; }
    setAcknowledged(false);
    setState(availability.kind !== 'available' ? { kind: 'unavailable', reason: availability.reason } : { kind: 'consent' });
  }, [availability, challengeId, user]);

  useFocusEffect(useCallback(() => {
    activeRef.current = true;
    void load();
    return () => { activeRef.current = false; };
  }, [load]));

  // Required for card authentication/redirect return flows, same as
  // payment-setup.tsx; a no-op on web.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => { void handleURLCallback(url); });
    return () => subscription.remove();
  }, [handleURLCallback]);

  const runVerificationPoll = useCallback(async () => {
    const outcome = await pollForAuthorization(
      async () => {
        if (!challengeId) return { authorized: false };
        const result = await fetchOwnerPaymentStatus(challengeId);
        if (!activeRef.current) return { authorized: true };
        if (!result.ok) return { authorized: false };
        return { authorized: result.value.state !== 'needs_attention' };
      },
      { signal: { get aborted() { return !activeRef.current; } } },
    );
    if (!activeRef.current) return;
    if (outcome === 'authorized') setState({ kind: 'done' });
    else if (outcome === 'timeout') setState((previous) => (previous.kind === 'verifying' ? { ...previous, timedOut: true } : previous));
  }, [challengeId]);

  const startPaymentSheet = useCallback(async () => {
    if (!user || !challengeId) return;
    setState({ kind: 'presenting' });

    const setupResult = await createConsequenceSetupIntent(challengeId, user.id);
    if (!activeRef.current) return;
    if (!setupResult.ok) {
      setState({ kind: 'error', message: setupResult.message });
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
      setState({ kind: 'error', message: 'Could not prepare the payment form. Try again.' });
      return;
    }

    const presentResult = await presentPaymentSheet();
    if (!activeRef.current) return;
    const outcome = classifyPaymentSheetPresentResult(presentResult.error);

    if (outcome === 'canceled') {
      void playSelectionHaptic();
      setState({ kind: 'consent' });
      return;
    }
    if (outcome === 'failed') {
      // Never the raw Stripe SDK message (presentResult.error?.message) —
      // it can include provider-specific decline detail. A single safe,
      // generic message covers both a real failure and a timeout, which
      // classifyPaymentSheetPresentResult already collapses together.
      setState({ kind: 'error', message: 'The payment step could not be completed. Try again.' });
      return;
    }

    void playCommitmentHaptic();
    setState({ kind: 'verifying', timedOut: false, checking: false });
    void runVerificationPoll();
  }, [challengeId, initPaymentSheet, presentPaymentSheet, returnURL, runVerificationPoll, user]);

  const toggleAcknowledged = () => {
    void playSelectionHaptic();
    setAcknowledged((current) => !current);
  };

  const continueToPaymentSheet = () => {
    if (state.kind !== 'consent' || !acknowledged || availability.kind !== 'available') return;
    void playImportantHaptic();
    void startPaymentSheet();
  };

  const checkAgain = useCallback(async () => {
    if (state.kind !== 'verifying' || !challengeId) return;
    setState((previous) => (previous.kind === 'verifying' ? { ...previous, checking: true } : previous));
    const result = await fetchOwnerPaymentStatus(challengeId);
    if (!activeRef.current) return;
    if (!result.ok) {
      setState((previous) => (previous.kind === 'verifying' ? { ...previous, checking: false } : previous));
      return;
    }
    if (result.value.state !== 'needs_attention') { setState({ kind: 'done' }); return; }
    setState({ kind: 'verifying', timedOut: true, checking: false });
  }, [challengeId, state]);

  const retry = () => {
    void playSelectionHaptic();
    void load();
  };

  const goBack = () => {
    void playSelectionHaptic();
    router.back();
  };

  const done = () => {
    void playImportantHaptic();
    router.replace(returnTo as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Goes back"
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

          <Text accessibilityRole="header" style={styles.headline}>Update payment method</Text>

          {state.kind === 'loading' && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Checking your payment status…</Text>
          )}

          {state.kind === 'not_needed' && (
            <View style={styles.section}>
              <Text style={styles.body}>This payment method doesn&apos;t need attention right now.</Text>
              <Pressable accessibilityHint="Returns to the challenge result" accessibilityRole="button" hitSlop={6} onPress={done} style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}>
                <Text style={styles.textButtonLabel}>Back</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'consent' && (
            <View style={styles.section}>
              <Text style={styles.stakeLine}>Kinwin could not charge your saved card for this challenge. Save a new card to continue.</Text>
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
                accessibilityHint="Opens Stripe's secure payment form to save a new card"
                disabled={!acknowledged}
                label="Update card"
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
                  : 'Payment setup is not configured in this build yet. Try again once it is configured.'}
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
                  ? 'Still confirming with Stripe. This can take a little longer than usual. You can check again, or leave and come back later.'
                  : 'Confirming your new card was saved. This usually takes a few seconds.'}
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

          {state.kind === 'done' && (
            <View style={styles.section}>
              <Text style={styles.body}>
                Your payment method has been updated. Kinwin will automatically retry the charge. You don&apos;t need to do anything else.
              </Text>
              <PrimaryButtonV2 accessibilityHint="Returns to the challenge result" label="Back to result" onPress={done} reducedMotion={reducedMotion} />
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

// Same points as payment-setup.tsx's DisclosureList — still accurate here:
// this screen only ever saves a card through a SetupIntent, it never
// charges one directly.
const DISCLOSURE_POINTS: readonly string[] = [
  'No money is charged now.',
  'Your card is saved securely with Stripe.',
  'Kinwin will automatically retry the existing charge once your card is saved.',
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
