import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { RecipientPromisePage } from '@/components/share/recipient-promise-page';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { OnboardingDraftData } from '@/domain/challenge/from-onboarding-draft';
import { applyResolvedRecipientIds } from '@/domain/challenge/recipient-ids';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';
import { saveChallengeDraft } from '@/lib/supabase/challenge-draft-repository';
import { prepareChallengeFromDraft } from '@/lib/supabase/challenge-repository';

type SaveState = 'idle' | 'signed_out' | 'saving' | 'preparing' | 'prepared' | 'error';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

function formatNames(names: string[]) {
  if (names.length === 0) return 'your recipients';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export default function CreateReviewScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const { status: authStatus, user } = useAuth();
  const { resumeSave } = useLocalSearchParams<{ resumeSave?: string }>();
  const {
    behaviorText,
    durationWeeks,
    experienceCategory,
    goal,
    invitationMessage,
    invitationMessageCustomized,
    recipients,
    rewardOrganizer,
    savedDraftId,
    setInvitationMessage,
    setInvitationMessageCustomized,
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const resumedRef = useRef(false);

  const successRule = calculateSuccessRule(onboarding);
  const recipientNames = recipients.map((recipient) => recipient.name.trim()).filter(Boolean);
  const recipientNamesText = formatNames(recipientNames);
  const organizerName =
    rewardOrganizer?.type === 'recipient'
      ? recipients.find((recipient) => recipient.id === rewardOrganizer.recipientId)?.name.trim()
      : rewardOrganizer?.name.trim();
  const categoryLabel = experienceCategory ? CATEGORY_LABELS[experienceCategory] : null;
  const formattedStake = stakeAmount ? `$${stakeAmount.toLocaleString('en-US')}` : null;

  const challengeText = successRule?.challengeSummary ? successRule.challengeSummary.replaceAll(' · ', ', ') : behaviorText.trim() || 'the challenge I’ve defined';
  const categoryText = experienceCategory ? CATEGORY_LABELS[experienceCategory].toLowerCase() : 'shared';
  const stakeText = stakeAmount ? `my $${stakeAmount.toLocaleString('en-US')} stake` : 'my stake';
  const recipientPronoun = recipientNames.length === 1 ? 'you' : 'you all';
  const suggestedMessage =
    `Hi! I’m starting a Kinwin challenge: ${challengeText}.\n\n` +
    `If I don’t keep my promise, ${recipientPronoun} could receive a shared ${categoryText} experience funded by ${stakeText}. ` +
    `${organizerName || 'The adult organizer'} will organize it, and I’ll sit it out. You won’t be asked to pay for anything.\n\n` +
    `I’ll send the Kinwin link myself, so it arrives from a name you trust.`;

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
    setSaveState('prepared');
  }, []);

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
    recipients, rewardOrganizer, runPrepare, savedDraftId, setMembershipChoice, setRecipients, setRewardOrganizer,
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

  const updateMessage = (message: string) => {
    setInvitationMessage(message);
    setInvitationMessageCustomized(true);
  };

  const useSuggestedMessage = () => {
    void playSelectionHaptic();
    setInvitationMessage(suggestedMessage);
    setInvitationMessageCustomized(false);
  };

  const confirmCommitment = () => {
    if (!draftIsValid) return;
    void playImportantHaptic();
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

  const goToPendingCommitment = () => {
    void playImportantHaptic();
    router.replace('/account/pending-commitment' as Href);
  };

  const openPreview = () => {
    void playSelectionHaptic();
    setPreviewOpen(true);
  };

  const busy = saveState === 'saving' || saveState === 'preparing';

  return (
    <CreateFlowScreenV2
      backHint="Returns to loved ones"
      currentStep={7}
      footer={
        saveState === 'prepared' ? (
          <PrimaryButtonV2
            accessibilityHint="Opens your saved commitment to continue with payment and activation"
            label="Continue to payment"
            onPress={goToPendingCommitment}
            reducedMotion={reducedMotion}
          />
        ) : (
          <View style={styles.footerStack}>
            {saveState === 'error' && (
              <View style={styles.errorRow}>
                <Text style={styles.errorText}>{saveErrorMessage ?? 'Something went wrong.'}</Text>
                <Pressable accessibilityHint="Retries saving your commitment" accessibilityRole="button" onPress={retrySave}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            )}
            {saveState === 'signed_out' && (
              <Pressable
                accessibilityHint="Opens sign in, then returns here to save your commitment"
                accessibilityRole="button"
                onPress={() => router.push('/auth?returnTo=/create/review&resumeSave=1' as Href)}
              >
                <Text style={styles.retryText}>Sign in to save your commitment</Text>
              </Pressable>
            )}
            <PrimaryButtonV2
              accessibilityHint={draftIsValid ? 'Saves your commitment and prepares payment setup' : 'Acknowledge the sit-out promise and write an invitation message before continuing'}
              disabled={!draftIsValid || busy}
              label={busy ? 'Saving…' : 'Confirm commitment'}
              onPress={confirmCommitment}
              reducedMotion={reducedMotion}
            />
          </View>
        )
      }
      headline="Review your promise."
      onBack={() => router.back()}
      progressLabel="Step 7 of 7: review"
      supportingCopy="One challenge. Two clear outcomes. Nothing is charged or activated on this screen."
      totalSteps={7}
    >
      <View style={styles.recap}>
        <Text style={styles.recapLabel}>YOUR CHALLENGE</Text>
        {goal.trim().length > 0 && <Text style={styles.goalText}>{goal.trim()}</Text>}
        <Text style={styles.recapText}>{successRule?.challengeSummary ?? 'Complete the earlier steps.'}</Text>
        <View style={styles.recapDivider} />
        <Text style={styles.recapLabel}>SUCCESS MEANS</Text>
        <Text style={styles.recapText}>{successRule?.overall ?? 'Meeting the success rule you set.'}</Text>
      </View>

      <View style={styles.futures}>
        <View style={styles.futureCard}>
          <Text style={styles.futureLabelKeep}>IF YOU SUCCEED</Text>
          <Text style={styles.futureTitle}>You keep the change.</Text>
          <Text style={styles.futureText}>Nothing is charged.</Text>
        </View>
        <View style={[styles.futureCard, styles.futureCardWin]}>
          <Text style={styles.futureLabelWin}>IF IT FAILS</Text>
          <Text style={styles.futureTitle}>They receive the experience.</Text>
          <Text style={styles.futureText}>
            {formattedStake && categoryLabel
              ? `${formattedStake} funds one shared ${categoryLabel.toLowerCase()} reward for ${recipientNamesText}.`
              : 'Your stake funds one shared reward.'}
          </Text>
        </View>
      </View>

      <View style={styles.summaryTable}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>RECIPIENTS</Text>
          <Text style={styles.summaryValue}>{recipientNamesText}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>ORGANIZER</Text>
          <Text style={styles.summaryValue}>{organizerName || 'Not set'}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryRowLast]}>
          <Text style={styles.summaryLabel}>EXPERIENCE</Text>
          <Text style={styles.summaryValue}>{categoryLabel || 'Not set'} · {formattedStake || 'Not set'}</Text>
        </View>
      </View>

      <Pressable accessibilityHint="Opens a preview of what your recipients will see" accessibilityRole="button" onPress={openPreview} style={styles.previewLink}>
        <Text style={styles.previewLinkText}>Preview what they’ll see</Text>
      </Pressable>

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

      <View style={styles.section}>
        <View style={styles.messageHeader}>
          <Text style={styles.sectionLabel}>YOUR MESSAGE TO THEM</Text>
          {invitationMessageCustomized && (
            <Pressable accessibilityHint="Replaces your edits with the current suggested draft" accessibilityRole="button" onPress={useSuggestedMessage}>
              <Text style={styles.resetText}>Use suggested</Text>
            </Pressable>
          )}
        </View>
        <TextInput
          accessibilityLabel="Invitation message"
          maxLength={1000}
          multiline
          onChangeText={updateMessage}
          placeholder="Write a personal invitation message"
          placeholderTextColor={theme.colors.warmGrey}
          selectionColor={theme.colors.crimsonBright}
          style={styles.messageInput}
          textAlignVertical="top"
          value={invitationMessage}
        />
        <Text style={styles.messageHelper}>Sent from your own messaging app—not by Kinwin.</Text>
      </View>

      <View style={styles.membershipRow}>
        <Text style={styles.membershipText}>Confirming starts a 7-day free Kinwin membership trial, then $9.99/month. Cancel anytime.</Text>
      </View>

      <BottomSheetV2 onClose={() => setPreviewOpen(false)} reducedMotion={reducedMotion} visible={previewOpen}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.previewScroll}>
          <RecipientPromisePage
            categoryLabel={categoryLabel ?? 'Experience'}
            challengeSummary={successRule?.challengeSummary ?? 'Challenge details are incomplete.'}
            goal={goal.trim() || 'Their larger goal will appear here.'}
            organizerIsRecipient={rewardOrganizer?.type === 'recipient'}
            organizerName={organizerName || 'The selected adult organizer'}
            recipientNames={recipientNames}
            stakeLabel={formattedStake ?? 'The stake'}
            successRule={successRule?.overall ?? 'The success rule is not yet available.'}
          />
        </ScrollView>
      </BottomSheetV2>
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  recap: {
    borderLeftWidth: 2, borderLeftColor: theme.colors.crimson, backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.precise, paddingHorizontal: 16, paddingVertical: 14,
  },
  recapLabel: { color: theme.colors.crimsonBright, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  goalText: { marginTop: 6, color: theme.colors.ivory, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  recapText: { marginTop: 5, color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  recapDivider: { height: 1, marginVertical: 12, backgroundColor: theme.colors.structureLine },
  futures: { flexDirection: 'row', gap: 8 },
  futureCard: {
    flex: 1, minHeight: 116, borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, padding: 14,
  },
  futureCardWin: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  futureLabelKeep: { color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  futureLabelWin: { color: theme.colors.crimsonBright, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  futureTitle: { marginTop: 8, color: theme.colors.ivory, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  futureText: { marginTop: 6, color: theme.colors.ivoryMuted, fontSize: 11, lineHeight: 16 },
  summaryTable: { borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  summaryRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, paddingHorizontal: 14 },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  summaryValue: { flex: 1, marginLeft: 12, color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  previewLink: { minHeight: 36, justifyContent: 'center' },
  previewLinkText: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  acknowledgement: {
    minHeight: 76, flexDirection: 'row', alignItems: 'center', borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  acknowledgementSelected: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  checkbox: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.ink,
  },
  checkboxSelected: { borderColor: theme.colors.crimsonBright, backgroundColor: theme.colors.oxbloodDeep },
  checkmark: { color: theme.colors.crimsonBright, fontSize: 14, fontWeight: '800' },
  acknowledgementText: { flex: 1, color: theme.colors.ivory, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  section: { gap: 8 },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  messageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resetText: { color: theme.colors.crimsonBright, fontSize: 12, fontWeight: '700' },
  messageInput: {
    minHeight: 140, borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, color: theme.colors.ivory, fontSize: 14, lineHeight: 20,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  messageHelper: { color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  membershipRow: { borderTopWidth: 1, borderTopColor: theme.colors.structureLine, paddingTop: 14 },
  membershipText: { color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  footerStack: { gap: 10 },
  errorRow: { gap: 4 },
  errorText: { color: '#E37D6A', fontSize: 12, lineHeight: 17 },
  retryText: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  previewScroll: { maxHeight: 560 },
});
