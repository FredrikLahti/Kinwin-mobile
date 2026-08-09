import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { formatRecipientNames } from '@/components/share/recipient-promise-page';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import {
  cancelPendingChallenge,
  fetchPendingCommitment,
  PendingCommitment,
} from '@/lib/supabase/challenge-repository';
import { activateChallenge } from '@/lib/supabase/active-challenge-repository';
import { calculateSuccessRule } from '@/lib/success-rule';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

// Makes an already-authorized commitment's status unmistakable about *why*
// activating it below won't ask for a card again — a real, dated prior
// authorization, not a bypass.
function formatAuthorizedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// Every state a signed-in user can be in on this screen. 'summary' is the
// only one that can reach 'confirmCancel'/'canceling'; those both carry the
// same commitment back so the screen never loses it while the user is
// deciding. Payment setup itself is a dedicated route
// (app/account/payment-setup.tsx), not a state here.
type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'summary'; readonly commitment: PendingCommitment }
  | { readonly kind: 'confirmCancel'; readonly commitment: PendingCommitment }
  | { readonly kind: 'canceling'; readonly commitment: PendingCommitment }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string; readonly retry: 'load' | 'cancel'; readonly commitment: PendingCommitment | null };

export default function PendingCommitmentScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const onboarding = useOnboarding();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  // Separate from `state` (rather than a new ScreenState kind) because
  // activation happens from the same 'summary' screen the founder is
  // already looking at — there is no separate confirm step the way
  // cancellation has one, so this only needs a lightweight in-place status.
  const [activation, setActivation] = useState<{ status: 'idle' | 'activating' | 'error'; message?: string }>({ status: 'idle' });

  const load = useCallback(async () => {
    if (!user) return;
    setState({ kind: 'loading' });
    const result = await fetchPendingCommitment(user.id);
    if (!result.ok) {
      const message = 'message' in result ? result.message : 'Sign in to see your pending commitment.';
      setState({ kind: 'error', message, retry: 'load', commitment: null });
      return;
    }
    setState(result.commitment ? { kind: 'summary', commitment: result.commitment } : { kind: 'none' });
  }, [user]);

  // Refetches every time this screen gains focus (not just on first mount),
  // so returning here after canceling elsewhere, or after a later payment
  // step exists, never shows a stale commitment.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const continueSetup = () => {
    if (state.kind !== 'summary') return;
    void playSelectionHaptic();
    router.push('/account/payment-setup' as Href);
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

  const askToCancel = () => {
    if (state.kind !== 'summary') return;
    void playSelectionHaptic();
    setState({ kind: 'confirmCancel', commitment: state.commitment });
  };

  const abortCancel = (commitment: PendingCommitment) => {
    void playSelectionHaptic();
    setState({ kind: 'summary', commitment });
  };

  const confirmCancel = useCallback(async (commitment: PendingCommitment) => {
    if (!user) return;
    setState({ kind: 'canceling', commitment });
    const result = await cancelPendingChallenge(commitment.challengeId, user.id);
    if (!result.ok) {
      const message = 'message' in result ? result.message : 'Sign in to cancel your pending commitment.';
      setState({ kind: 'error', message, retry: 'cancel', commitment });
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
    if (state.kind !== 'error') return;
    if (state.retry === 'cancel' && state.commitment) {
      void confirmCancel(state.commitment);
      return;
    }
    void load();
  };

  const startNewDraft = () => {
    void playImportantHaptic();
    onboarding.resetDraft();
    router.replace('/create/goal' as Href);
  };

  const goBack = () => {
    void playSelectionHaptic();
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Returns to your account"
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
            <Text style={styles.phaseLabel}>PENDING COMMITMENT</Text>
            <Text accessibilityRole="header" style={styles.headline}>
              {state.kind === 'canceled' ? 'Commitment canceled' : 'Your pending commitment'}
            </Text>
          </View>

          {state.kind === 'loading' && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Checking your pending commitment…</Text>
          )}

          {state.kind === 'none' && (
            <View style={styles.section}>
              <Text style={styles.body}>
                You don&apos;t have a pending commitment yet. Complete setup to create one.
              </Text>
              <Pressable
                accessibilityHint="Starts a new onboarding draft"
                accessibilityRole="button"
                onPress={startNewDraft}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>Start a new draft</Text>
              </Pressable>
            </View>
          )}

          {(state.kind === 'summary' || state.kind === 'confirmCancel' || state.kind === 'canceling') && (
            <CommitmentSummary commitment={state.commitment} />
          )}

          {state.kind === 'summary' && state.commitment.authorizationStatus === 'authorized' && (
            <View style={styles.actions}>
              <PrimaryButtonV2
                accessibilityHint="Activates this challenge for real — tracking starts today"
                disabled={activation.status === 'activating'}
                label={activation.status === 'activating' ? 'Activating…' : 'Activate challenge'}
                onPress={() => void activate(state.commitment)}
                reducedMotion={reducedMotion}
              />
              {activation.status === 'error' && (
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>{activation.message}</Text>
              )}
              <Pressable
                accessibilityHint="Opens payment setup to review or change your saved payment method"
                accessibilityRole="button"
                onPress={continueSetup}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>Review payment method</Text>
              </Pressable>
              <Pressable
                accessibilityHint="Asks for confirmation before canceling this pending commitment"
                accessibilityRole="button"
                onPress={askToCancel}
                style={({ pressed }) => [styles.dangerButton, pressed && styles.dangerButtonPressed]}
              >
                <Text style={styles.dangerButtonLabel}>Cancel commitment</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'summary' && state.commitment.authorizationStatus !== 'authorized' && (
            <View style={styles.actions}>
              <PrimaryButtonV2
                accessibilityHint="Opens payment setup to save a payment method for this commitment"
                label="Continue setup"
                onPress={continueSetup}
                reducedMotion={reducedMotion}
              />
              <Pressable
                accessibilityHint="Asks for confirmation before canceling this pending commitment"
                accessibilityRole="button"
                onPress={askToCancel}
                style={({ pressed }) => [styles.dangerButton, pressed && styles.dangerButtonPressed]}
              >
                <Text style={styles.dangerButtonLabel}>Cancel commitment</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'confirmCancel' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CONFIRM CANCELLATION</Text>
              <Text style={styles.body}>
                Canceling is only possible before activation — nothing has been charged or activated
                yet, so this simply ends the commitment. This cannot be undone; you would need to
                start a new draft to try again.
              </Text>
              <PrimaryButtonV2
                accessibilityHint="Permanently cancels this pending commitment"
                label="Yes, cancel commitment"
                onPress={() => void confirmCancel(state.commitment)}
                reducedMotion={reducedMotion}
              />
              <Pressable
                accessibilityHint="Keeps the pending commitment and returns to the summary"
                accessibilityRole="button"
                onPress={() => abortCancel(state.commitment)}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>No, keep it</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'canceling' && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Canceling your commitment…</Text>
          )}

          {state.kind === 'canceled' && (
            <View style={styles.section}>
              <Text style={styles.body}>
                This commitment has been canceled. The record is kept for your history, but it no
                longer holds a place — you&apos;re free to start a new draft.
              </Text>
              <PrimaryButtonV2
                accessibilityHint="Starts a fresh onboarding draft"
                label="Start a new draft"
                onPress={startNewDraft}
                reducedMotion={reducedMotion}
              />
            </View>
          )}

          {state.kind === 'error' && (
            <View style={styles.section}>
              <Text style={styles.errorText}>{state.message}</Text>
              <Pressable
                accessibilityHint="Tries the last action again"
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

function CommitmentSummary({ commitment }: { readonly commitment: PendingCommitment }) {
  const successRule = calculateSuccessRule({
    ...commitment.draftData,
    rhythm: { ...commitment.draftData.rhythm, selectedWeekdays: [...commitment.draftData.rhythm.selectedWeekdays] },
  });
  const categoryLabel = commitment.draftData.experienceCategory
    ? CATEGORY_LABELS[commitment.draftData.experienceCategory]
    : 'Not set';
  const organizer = commitment.recipients.find((recipient) => recipient.isOrganizer);
  const recipientNames = commitment.recipients.map((recipient) => recipient.displayName);
  const stakeLabel = `$${(commitment.stakeMinorUnits / 100).toLocaleString('en-US')}`;

  return (
    <View style={styles.summary}>
      <View style={styles.lockedNotice}>
        <View aria-hidden style={styles.lockedMark} />
        <Text style={styles.lockedText}>
          This commitment is locked in and saved on the server. It can no longer be edited, and
          recipients cannot be replaced — cancel and start a new draft to change anything.
        </Text>
      </View>

      <SummaryRow label="GOAL" value={commitment.draftData.goal} />
      <SummaryRow label="PROMISED BEHAVIOR" value={commitment.draftData.behaviorText} />
      <SummaryRow label="SUCCESS RULE" value={successRule?.overall ?? successRule?.challengeSummary ?? 'Not available'} />
      <SummaryRow label="DURATION" value={`${commitment.draftData.durationWeeks ?? '—'} weeks`} />
      <SummaryRow
        label="RECIPIENTS AND ORGANIZER"
        value={`${formatRecipientNames(recipientNames)}${organizer ? ` · Organizer: ${organizer.displayName}` : ''}`}
      />
      <SummaryRow label="CONSEQUENCE CATEGORY" value={categoryLabel} />
      <SummaryRow label="STAKE" value={stakeLabel} />
      <SummaryRow
        label="CURRENT STATUS"
        value={
          commitment.authorizationStatus === 'authorized'
            ? `Payment method saved${commitment.authorizedAt ? ` on ${formatAuthorizedDate(commitment.authorizedAt)}` : ''}. No charge has been made — activating below reuses this saved method rather than asking again.`
            : 'Pending — payment setup and final activation are still required.'
        }
      />
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
  backIcon: { color: theme.colors.crimsonBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  intro: { gap: 8 },
  phaseLabel: { color: theme.colors.crimson, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700', lineHeight: 32 },
  body: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  errorText: { color: '#E37D6A', fontSize: 14, lineHeight: 21 },
  section: { gap: 14, borderTopWidth: 1, borderTopColor: theme.colors.structureLine, paddingTop: 20 },
  sectionLabel: { color: theme.colors.crimson, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  summary: { gap: 16 },
  lockedNotice: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  lockedMark: { width: 2, height: '100%', minHeight: 30, backgroundColor: theme.colors.crimson },
  lockedText: { flex: 1, color: theme.colors.ivoryMuted, fontSize: 11, lineHeight: 17 },
  summaryRow: {
    gap: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, paddingBottom: 12,
  },
  summaryLabel: { color: theme.colors.crimson, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  summaryValue: { color: theme.colors.ivory, fontSize: 14, lineHeight: 20 },
  actions: { gap: 12, paddingTop: 4 },
  dangerButton: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
  },
  dangerButtonPressed: { backgroundColor: theme.colors.surface },
  dangerButtonLabel: { color: '#E37D6A', fontSize: 14, fontWeight: '700' },
});
