import * as Linking from 'expo-linking';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { formatRecipientNames } from '@/components/share/recipient-promise-page';
import { kinwinTheme as theme } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { ExperienceCategory } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playCommitmentHaptic, playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { readStripeConfig } from '@/lib/stripe/config';
import { useStripe, usePaymentSheet } from '@/lib/stripe/native-stripe';
import { classifyPaymentSheetPresentResult } from '@/lib/stripe/payment-sheet-outcome';
import { derivePaymentSetupAvailability } from '@/lib/stripe/payment-setup-availability';
import { pollForAuthorization } from '@/lib/stripe/poll-authorization';
import { fetchPendingCommitment, PendingCommitment } from '@/lib/supabase/challenge-repository';
import { createConsequenceSetupIntent } from '@/lib/supabase/consequence-setup-repository';
import { calculateSuccessRule } from '@/lib/success-rule';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

type SetupMode = 'initial' | 'replace';

// 'presenting' and 'verifying' are only ever reached through startPaymentSheet
// below — never set directly from a re-fetch — so a background refetch can
// never interrupt an in-flight card step or verification. PaymentSheet
// itself is a native modal that blocks the screen underneath while it is
// up, so commitment cancellation (which lives only on the pending-commitment
// screen) is structurally unreachable during 'presenting' — there is no
// separate flag to manage for that requirement.
type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'unavailable'; readonly reason: 'not_configured' | 'native_required'; readonly commitment: PendingCommitment }
  | { readonly kind: 'consent'; readonly commitment: PendingCommitment; readonly mode: SetupMode }
  | { readonly kind: 'presenting'; readonly commitment: PendingCommitment; readonly mode: SetupMode }
  | { readonly kind: 'verifying'; readonly commitment: PendingCommitment; readonly timedOut: boolean; readonly checking: boolean }
  | { readonly kind: 'ready'; readonly commitment: PendingCommitment }
  | { readonly kind: 'error'; readonly commitment: PendingCommitment | null; readonly message: string };

export default function PaymentSetupScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const { handleURLCallback } = useStripe();

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
    if (result.commitment.authorizationStatus === 'authorized') {
      setState({ kind: 'ready', commitment: result.commitment });
    } else if (availability.kind !== 'available') {
      setState({ kind: 'unavailable', reason: availability.reason, commitment: result.commitment });
    } else {
      setState({ kind: 'consent', commitment: result.commitment, mode: 'initial' });
    }
  }, [availability, user]);

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
          setState({ kind: 'ready', commitment: result.commitment });
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
  }, [user]);

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

  const startReplacement = () => {
    if (state.kind !== 'ready') return;
    void playSelectionHaptic();
    setAcknowledged(false);
    if (availability.kind !== 'available') {
      setState({ kind: 'unavailable', reason: availability.reason, commitment: state.commitment });
      return;
    }
    setState({ kind: 'consent', commitment: state.commitment, mode: 'replace' });
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
      setState({ kind: 'ready', commitment: result.commitment });
      return;
    }
    setState({ kind: 'verifying', commitment: result.commitment, timedOut: true, checking: false });
  }, [state, user]);

  const retry = () => {
    void playSelectionHaptic();
    void load();
  };

  const goBack = () => {
    void playSelectionHaptic();
    router.back();
  };

  const doneForNow = () => {
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

          <View style={styles.intro}>
            <Text style={styles.phaseLabel}>PAYMENT SETUP</Text>
            <Text accessibilityRole="header" style={styles.headline}>
              {state.kind === 'ready' ? 'Payment method ready' : 'Save a payment method'}
            </Text>
          </View>

          {state.kind === 'loading' && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Checking your commitment…</Text>
          )}

          {state.kind === 'none' && (
            <View style={styles.section}>
              <Text style={styles.body}>
                This commitment could not be found — it may have already been canceled.
              </Text>
              <Pressable
                accessibilityHint="Returns to your pending commitment"
                accessibilityRole="button"
                onPress={backToCommitment}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>Back to your commitment</Text>
              </Pressable>
            </View>
          )}

          {(state.kind === 'consent' || state.kind === 'presenting' || state.kind === 'unavailable') && (
            <ConsentSummary commitment={state.commitment} mode={state.kind === 'consent' || state.kind === 'presenting' ? state.mode : 'initial'} />
          )}

          {state.kind === 'consent' && (
            <View style={styles.section}>
              <DisclosureList />

              <Pressable
                accessibilityLabel="I understand and accept how my saved card may be used, as described above"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acknowledged }}
                hitSlop={3}
                onPress={toggleAcknowledged}
                style={({ pressed }) => [styles.acknowledgement, acknowledged && styles.acknowledgementSelected, pressed && styles.acknowledgementPressed]}
              >
                <View aria-hidden style={[styles.acknowledgementMark, acknowledged && styles.acknowledgementMarkSelected]}>
                  <Text style={styles.acknowledgementCheck}>{acknowledged ? '✓' : ''}</Text>
                </View>
                <Text style={styles.acknowledgementText}>
                  I understand and accept how my saved card may be used, as described above.
                </Text>
              </Pressable>

              <AnimatedPrimaryButton
                accessibilityHint="Opens Stripe's secure payment form to save a card"
                disabled={!acknowledged}
                label={state.mode === 'replace' ? 'Continue to update payment' : 'Continue to payment'}
                onPress={continueToPaymentSheet}
                reducedMotion={reducedMotion}
              />
            </View>
          )}

          {state.kind === 'unavailable' && (
            <View style={styles.section}>
              <Text style={styles.errorText}>
                {state.reason === 'native_required'
                  ? 'Payment setup requires the Kinwin app on a phone or tablet. This screen is shown for visual review only — the payment form cannot open here.'
                  : 'Payment setup is not configured in this build yet. The rest of Kinwin remains usable — try again once it is configured.'}
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
                  ? 'Still verifying with Stripe. This can take a little longer than usual — you can check again, or leave and come back later; your progress is saved.'
                  : 'Stripe confirmed the card step. Kinwin is now waiting for the server to confirm the payment method is saved — this usually takes a few seconds.'}
              </Text>
              {state.timedOut && (
                <Pressable
                  accessibilityHint="Checks the server again for confirmation"
                  accessibilityRole="button"
                  disabled={state.checking}
                  onPress={() => void checkAgain()}
                  style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
                >
                  <Text style={styles.textButtonLabel}>{state.checking ? 'Checking…' : 'Check again'}</Text>
                </Pressable>
              )}
            </View>
          )}

          {state.kind === 'ready' && (
            <View style={styles.section}>
              <View style={styles.readyNotice}>
                <View aria-hidden style={styles.readyMark} />
                <Text style={styles.readyText}>
                  Your payment method is saved for this commitment. No charge has been made. This challenge
                  still needs final activation, which is a separate later step.
                </Text>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint="Returns to your pending commitment"
                label="Done for now"
                onPress={doneForNow}
                reducedMotion={reducedMotion}
              />
              <Pressable
                accessibilityHint="Starts saving a different payment method for this commitment"
                accessibilityRole="button"
                onPress={startReplacement}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>Change payment method</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'error' && (
            <View style={styles.section}>
              <Text style={styles.errorText}>{state.message}</Text>
              <Pressable
                accessibilityHint="Tries again"
                accessibilityRole="button"
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

function ConsentSummary({ commitment, mode }: { readonly commitment: PendingCommitment; readonly mode: SetupMode }) {
  const successRule = calculateSuccessRule({
    ...commitment.draftData,
    rhythm: { ...commitment.draftData.rhythm, selectedWeekdays: [...commitment.draftData.rhythm.selectedWeekdays] },
  });
  const categoryLabel = commitment.draftData.experienceCategory ? CATEGORY_LABELS[commitment.draftData.experienceCategory] : 'Not set';
  const organizer = commitment.recipients.find((recipient) => recipient.isOrganizer);
  const recipientNames = commitment.recipients.map((recipient) => recipient.displayName);
  const stakeLabel = `$${(commitment.stakeMinorUnits / 100).toLocaleString('en-US')} ${commitment.currency}`;

  return (
    <View style={styles.summary}>
      <View style={styles.lockedNotice}>
        <View aria-hidden style={styles.lockedMark} />
        <Text style={styles.lockedText}>
          {mode === 'replace'
            ? 'Your currently saved payment method stays active and usable until Stripe confirms the new one — nothing is disabled while you set up a replacement.'
            : 'This is what you are saving a payment method for:'}
        </Text>
      </View>

      <SummaryRow label="STAKE" value={stakeLabel} />
      <SummaryRow label="CONSEQUENCE CATEGORY" value={categoryLabel} />
      <SummaryRow
        label="RECIPIENT"
        value={`${formatRecipientNames(recipientNames)}${organizer ? ` · Organizer: ${organizer.displayName}` : ''}`}
      />
      <SummaryRow label="TRIGGERS A CHARGE IF" value={successRule?.overall ?? successRule?.challengeSummary ?? 'This locked challenge fails.'} />
    </View>
  );
}

// The data list docs/PRODUCT_DECISIONS.md's "Consequence payment setup" section
// requires the consent screen to convey — plain product copy, not approved legal
// wording (see that section's own caveat: final consent copy requires legal review
// before shipping).
const DISCLOSURE_POINTS: readonly string[] = [
  'No money is charged now.',
  'Your card is saved securely with Stripe for possible later use.',
  'If this locked challenge is determined to have failed, the stake shown above may be charged to this card.',
  'That charge can happen automatically, even while you are not using Kinwin.',
  'This card is saved only for this commitment — not for any other purpose.',
  'Saving a payment method does not activate this challenge.',
  'Final activation and your Kinwin membership are separate, still-future steps.',
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

function SummaryRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: 26, paddingTop: 6, paddingBottom: 24, gap: 22,
  },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, marginRight: 4, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  intro: { gap: 8 },
  phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 30, fontWeight: '400', lineHeight: 36,
  },
  body: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  errorText: { color: '#E37D6A', fontSize: 14, lineHeight: 21 },
  section: { gap: 14, borderTopWidth: 1, borderTopColor: theme.colors.structureLine, paddingTop: 20 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
  summary: { gap: 16 },
  lockedNotice: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  lockedMark: { width: 2, height: '100%', minHeight: 30, backgroundColor: theme.colors.copper },
  lockedText: { flex: 1, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  summaryRow: {
    gap: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, paddingBottom: 12,
  },
  summaryLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  summaryValue: { color: theme.colors.bone, fontSize: 14, lineHeight: 20 },
  disclosureList: { gap: 10 },
  disclosureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  disclosureMark: { width: 4, height: 4, marginTop: 7, borderRadius: 2, backgroundColor: theme.colors.copper },
  disclosureText: { flex: 1, color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  acknowledgement: {
    minHeight: 88, flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
    paddingHorizontal: 15, paddingVertical: 14,
  },
  acknowledgementSelected: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.surfaceRaised },
  acknowledgementPressed: { backgroundColor: theme.colors.surfaceFocused },
  acknowledgementMark: {
    width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginRight: 13,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: 3, backgroundColor: theme.colors.deepInk,
  },
  acknowledgementMarkSelected: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperDeep },
  acknowledgementCheck: { color: theme.colors.copperBright, fontSize: 15, fontWeight: '800' },
  acknowledgementText: { flex: 1, color: theme.colors.bone, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  readyNotice: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.copper,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  readyMark: { width: 2, height: '100%', minHeight: 30, backgroundColor: theme.colors.copperBright },
  readyText: { flex: 1, color: theme.colors.bone, fontSize: 13, lineHeight: 19 },
});
