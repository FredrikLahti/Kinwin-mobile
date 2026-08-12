import { Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { OnboardingDraftData } from '@/domain/challenge/from-onboarding-draft';
import { applyResolvedRecipientIds } from '@/domain/challenge/recipient-ids';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';
import { describeChallengeRule } from '@/lib/challenge-creation/summary';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';
import { saveChallengeDraft } from '@/lib/supabase/challenge-draft-repository';
import { fetchPendingCommitment, prepareChallengeFromDraft } from '@/lib/supabase/challenge-repository';

type SaveState = 'idle' | 'signed_out' | 'saving' | 'preparing' | 'error';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

// Compact and scales cleanly to any recipient count, unlike a prose
// sentence ("Mom, Dad, and Elsa gets...") whose grammar has to change with
// the count. "Mom, Dad +1" reads the same shape whether there are 2 or 4.
function formatRecipientsCompact(names: string[]): string {
  if (names.length === 0) return 'Your recipients';
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

export default function CreateReviewScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const { status: authStatus, user } = useAuth();
  const { resumeSave } = useLocalSearchParams<{ resumeSave?: string }>();
  const {
    behaviorDirection,
    behaviorText,
    durationWeeks,
    experienceCategory,
    goal,
    invitationMessage,
    invitationMessageCustomized,
    measurementMode,
    recipients,
    rewardOrganizer,
    rhythm,
    savedDraftId,
    setInvitationMessage,
    setMembershipChoice,
    setRecipients,
    setRewardOrganizer,
    setSavedDraftId,
    setSitOutAcknowledged,
    sitOutAcknowledged,
    stakeAmount,
  } = onboarding;

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [lastFailedStep, setLastFailedStep] = useState<'save' | 'prepare' | null>(null);
  const resumedRef = useRef(false);
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'review');

  // A previously prepared commitment archives its source draft on the
  // server, permanently. If this screen is reached again after that (e.g.
  // the user backed up into an earlier creation step and stepped forward
  // again — see the regression test for the exact repro), it must resume
  // the real pending commitment rather than let the user "confirm" a stale,
  // now-immutable draft a second time. This check runs in the background
  // rather than blocking the initial render (which used to show a blank
  // frame while it was in flight, unlike every other create screen — all
  // of which render synchronously from in-memory draft state): the rare
  // case where it fires mid-render is still safe, since saveDraft()'s own
  // "archived" error handling below redirects the same way if the user
  // manages to tap Confirm before this resolves.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (!user) return;
    void fetchPendingCommitment(user.id).then((result) => {
      if (cancelled) return;
      if (result.ok && result.commitment) {
        router.replace('/account/pending-commitment' as Href);
      }
    });
    return () => { cancelled = true; };
  }, [router, user]));

  const successRule = calculateSuccessRule(onboarding);
  const ruleSummary = describeChallengeRule({ behaviorDirection, behaviorText, measurementMode, rhythm });
  const recipientNames = recipients.map((recipient) => recipient.name.trim()).filter(Boolean);
  const recipientsCompact = formatRecipientsCompact(recipientNames);
  const organizerName =
    rewardOrganizer?.type === 'recipient'
      ? recipients.find((recipient) => recipient.id === rewardOrganizer.recipientId)?.name.trim()
      : rewardOrganizer?.name.trim();
  const categoryLabel = experienceCategory ? CATEGORY_LABELS[experienceCategory] : null;
  const formattedStake = stakeAmount ? `$${stakeAmount.toLocaleString('en-US')}` : null;

  const recipientPronoun = recipientNames.length === 1 ? 'you' : 'you all';
  const suggestedMessage =
    `Hi! I am starting a Kinwin challenge: ${ruleSummary || behaviorText.trim() || 'a challenge I have defined'}.\n\n` +
    `If I do not keep it, ${recipientPronoun} could receive a ${categoryLabel ? categoryLabel.toLowerCase() : 'shared'} experience funded by ${formattedStake ? `my ${formattedStake} stake` : 'my stake'}. ` +
    `${organizerName || 'The adult organizer'} will organize it, and I will not take part. You will not be asked to pay for anything.\n\n` +
    `I will send the Kinwin link myself, so it arrives from a name you trust.`;

  // Kept silently populated even though this screen no longer shows an
  // editable message field (that moved to the post-confirm Share screen) —
  // the server still requires a non-empty invitationMessage to prepare
  // this draft.
  useEffect(() => {
    if (!invitationMessageCustomized && invitationMessage !== suggestedMessage) {
      setInvitationMessage(suggestedMessage);
    }
  }, [invitationMessage, invitationMessageCustomized, setInvitationMessage, suggestedMessage]);

  const hasValidOrganizer = Boolean(
    rewardOrganizer?.type === 'recipient'
      ? recipients.some((recipient) => recipient.id === rewardOrganizer.recipientId && recipient.name.trim().length > 0)
      : rewardOrganizer?.name.trim(),
  );
  const draftIsValid = Boolean(
    goal.trim().length >= 3 &&
      behaviorText.trim().length >= 3 &&
      durationWeeks &&
      durationWeeks >= 2 &&
      durationWeeks <= 12 &&
      successRule &&
      recipientNames.length > 0 &&
      recipientNames.length === recipients.length &&
      hasValidOrganizer &&
      experienceCategory &&
      stakeAmount &&
      Number.isFinite(stakeAmount) &&
      stakeAmount > 0 &&
      sitOutAcknowledged &&
      invitationMessage.trim().length >= 3,
  );

  const advanceToShare = useCallback(() => {
    void playImportantHaptic();
    // The draft this id pointed to is now archived server-side and can
    // never be reused — clearing it here is what makes it safe if the user
    // somehow lands back on this screen later (the focus guard above is the
    // primary defense; this is what makes a slipped-through resubmission
    // insert a fresh draft instead of hitting the archived-row immutability
    // trigger). onboarding.resetDraft() happens later, once the Share
    // screen is done with these fields.
    setSavedDraftId(null);
    router.replace('/create/share' as Href);
  }, [router, setSavedDraftId]);

  const runPrepare = useCallback(async (draftId: string, ownerId: string) => {
    setSaveState('preparing');
    setSaveErrorMessage(null);
    const prepared = await prepareChallengeFromDraft(draftId, ownerId);
    if (!prepared.ok) {
      setLastFailedStep('prepare');
      setSaveState('error');
      switch (prepared.kind) {
        case 'not_authenticated':
        case 'not_configured':
          setSaveErrorMessage('Sign in to save your pending commitment.');
          break;
        default:
          setSaveErrorMessage('message' in prepared ? prepared.message : 'Could not save your pending commitment.');
      }
      return;
    }
    setLastFailedStep(null);
    advanceToShare();
  }, [advanceToShare]);

  const saveDraft = useCallback(async () => {
    if (authStatus !== 'signed_in' || !user) {
      setSaveState('signed_out');
      return;
    }
    setSaveState('saving');
    setSaveErrorMessage(null);
    setMembershipChoice('monthly_trial');
    const data: OnboardingDraftData = {
      goal, behaviorText, definitionText: onboarding.definitionText, behaviorDirection: onboarding.behaviorDirection,
      measurementMode: onboarding.measurementMode, rhythm: onboarding.rhythm, durationWeeks,
      recipients: recipients.map((recipient) => ({ id: recipient.id, name: recipient.name })),
      rewardOrganizer, experienceCategory, stakeAmount, currency: onboarding.currency,
      sitOutAcknowledged, invitationMessage, membershipChoice: 'monthly_trial',
    };
    const result = await saveChallengeDraft({ data, recipients, existingDraftId: savedDraftId, userId: user.id });
    if (!result.ok) {
      setLastFailedStep('save');
      setSaveState('error');
      switch (result.kind) {
        case 'invalid':
          setSaveErrorMessage('Some earlier step is incomplete.');
          break;
        case 'not_authenticated':
        case 'not_configured':
          setSaveErrorMessage('Sign in to save your progress.');
          break;
        default:
          // Last-resort net: an existing commitment being prepared under a
          // different tab/session, or any other path that slipped past the
          // focus guard above, surfaces as exactly this immutability error
          // — resume the real commitment instead of showing a raw database
          // message.
          if (result.message.toLowerCase().includes('archived')) {
            router.replace('/account/pending-commitment' as Href);
            return;
          }
          setSaveErrorMessage(result.message);
      }
      return;
    }
    const resolved = applyResolvedRecipientIds(recipients, rewardOrganizer, result.recipientIds);
    setRecipients(resolved.recipients);
    setRewardOrganizer(resolved.rewardOrganizer);
    setSavedDraftId(result.draft.id);
    await runPrepare(result.draft.id, user.id);
  }, [
    authStatus, behaviorText, durationWeeks, experienceCategory, goal, invitationMessage, onboarding.currency,
    onboarding.behaviorDirection, onboarding.definitionText, onboarding.measurementMode, onboarding.rhythm,
    recipients, router, rewardOrganizer, runPrepare, savedDraftId, setMembershipChoice, setRecipients, setRewardOrganizer,
    setSavedDraftId, sitOutAcknowledged, stakeAmount, user,
  ]);

  useEffect(() => {
    if (resumeSave !== '1' || resumedRef.current) return;
    resumedRef.current = true;
    if (draftIsValid && authStatus === 'signed_in') void saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, resumeSave]);

  const toggleAcknowledgement = () => {
    void playSelectionHaptic();
    setSitOutAcknowledged((current) => !current);
  };

  const confirmCommitment = () => {
    if (!draftIsValid) return;
    void saveDraft();
  };

  const retrySave = () => {
    void playSelectionHaptic();
    if (lastFailedStep === 'prepare' && savedDraftId && user) {
      void runPrepare(savedDraftId, user.id);
      return;
    }
    void saveDraft();
  };

  const busy = saveState === 'saving' || saveState === 'preparing';

  return (
    <CreateFlowScreenV2
      backHint="Returns to the consequence"
      currentStep={currentStep}
      footer={
        <View style={styles.footerStack}>
          {saveState === 'error' && (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{saveErrorMessage ?? 'Something went wrong.'}</Text>
              <Pressable accessibilityHint="Retries saving your commitment" accessibilityRole="button" hitSlop={6} onPress={retrySave} style={styles.retryAction}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
          {saveState === 'signed_out' && (
            <Pressable
              accessibilityHint="Opens sign in, then returns here to save your commitment"
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => router.push('/auth?returnTo=/create/review&resumeSave=1' as Href)}
              style={styles.retryAction}
            >
              <Text style={styles.retryText}>Sign in to save your commitment</Text>
            </Pressable>
          )}
          <PrimaryButtonV2
            accessibilityHint={draftIsValid ? 'Saves your commitment and continues to sharing' : 'Confirm you will not take part in the reward before continuing'}
            disabled={!draftIsValid || busy}
            label={busy ? 'Saving…' : 'Confirm commitment'}
            onPress={confirmCommitment}
            reducedMotion={reducedMotion}
          />
        </View>
      }
      headline="Review your challenge"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: review`}
      totalSteps={totalSteps}
    >
      <View style={styles.recap}>
        {goal.trim().length > 0 && <Text style={styles.goalText}>{goal.trim()}</Text>}
        <Text style={styles.recapText}>{ruleSummary || 'Complete the earlier steps.'}</Text>
      </View>

      <View style={styles.outcomes}>
        <View style={styles.outcomeRow}>
          <Text style={styles.outcomeLabel}>Success</Text>
          <Text style={styles.outcomeValue}>Pay nothing</Text>
        </View>
        <View style={[styles.outcomeRow, styles.outcomeRowLast]}>
          <Text style={styles.outcomeLabel}>If missed</Text>
          <View style={styles.missedDetails}>
            <Text style={styles.missedRecipients}>{recipientsCompact}</Text>
            <Text style={styles.missedCategory}>{categoryLabel ? `${categoryLabel} experience` : 'Reward'}</Text>
            {formattedStake && <Text style={styles.missedStake}>{formattedStake}</Text>}
          </View>
        </View>
      </View>

      <View style={styles.summaryTable}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>RECIPIENTS</Text>
          <Text style={styles.summaryValue}>{recipientNames.join(', ') || 'Not set'}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryRowLast]}>
          <Text style={styles.summaryLabel}>ORGANIZER</Text>
          <Text style={styles.summaryValue}>{organizerName || 'Not set'}</Text>
        </View>
      </View>

      <Pressable
        accessibilityHint="Confirms you will not participate in the recipients' experience if the challenge fails"
        accessibilityRole="button"
        accessibilityState={{ selected: sitOutAcknowledged }}
        onPress={toggleAcknowledgement}
        style={[styles.acknowledgement, sitOutAcknowledged && styles.acknowledgementSelected]}
      >
        <View style={[styles.checkbox, sitOutAcknowledged && styles.checkboxSelected]}>
          {sitOutAcknowledged && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.acknowledgementText}>
          If the challenge fails, the reward is for my recipients. I will not take part in their experience.
        </Text>
      </Pressable>

      <View style={styles.membershipRow}>
        <Text style={styles.membershipText}>Kinwin membership is free during the beta. No card is charged for membership.</Text>
      </View>
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  recap: {
    borderLeftWidth: 2, borderLeftColor: theme.colors.oxblood, backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.precise, paddingHorizontal: 16, paddingVertical: 14,
  },
  goalText: { color: theme.colors.ivory, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  recapText: { marginTop: 5, color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  outcomes: { borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  outcomeRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, paddingHorizontal: 14, paddingVertical: 10 },
  outcomeRowLast: { borderBottomWidth: 0 },
  outcomeLabel: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600' },
  outcomeValue: { flex: 1, marginLeft: 12, color: theme.colors.ivory, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  missedDetails: { flex: 1, marginLeft: 12, alignItems: 'flex-end', gap: 2 },
  missedRecipients: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700' },
  missedCategory: { color: theme.colors.ivoryMuted, fontSize: 12 },
  missedStake: { color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '600' },
  summaryTable: { borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  summaryRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, paddingHorizontal: 14 },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  summaryValue: { flex: 1, marginLeft: 12, color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  acknowledgement: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  acknowledgementSelected: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep },
  checkbox: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.ink,
  },
  checkboxSelected: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep },
  checkmark: { color: theme.colors.ivory, fontSize: 14, fontWeight: '800' },
  acknowledgementText: { flex: 1, color: theme.colors.ivory, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  membershipRow: { borderTopWidth: 1, borderTopColor: theme.colors.structureLine, paddingTop: 12 },
  membershipText: { color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  footerStack: { gap: 10 },
  errorRow: { gap: 4 },
  errorText: { color: '#E37D6A', fontSize: 12, lineHeight: 17 },
  retryAction: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  retryText: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
});
