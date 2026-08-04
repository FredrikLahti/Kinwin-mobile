import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { formatRecipientNames } from '@/components/share/recipient-promise-page';
import { kinwinTheme as theme } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { OnboardingDraftData } from '@/domain/challenge/from-onboarding-draft';
import { applyResolvedRecipientIds } from '@/domain/challenge/recipient-ids';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { saveChallengeDraft } from '@/lib/supabase/challenge-draft-repository';
import { prepareChallengeFromDraft } from '@/lib/supabase/challenge-repository';
import { calculateSuccessRule } from '@/lib/success-rule';

// 'saved' only ever appears transiently between a successful draft save and
// the pending-commitment RPC call that follows it. 'prepared' is the
// server-saved, server-owned pending_activation commitment — a materially
// different state from the local-only "Preview active challenge" shortcut
// below, which never talks to the server at all.
type SaveState = 'idle' | 'signed_out' | 'saving' | 'saved' | 'preparing' | 'prepared' | 'error';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

const NEXT_STEPS = [
  'Start the Kinwin membership',
  'Add a payment method for the challenge stake',
  'Create the recipient link',
  'Share it through your own messaging app',
  'Activate the challenge',
] as const;

export default function ShareActivateScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const { isConfigured, status: authStatus, user } = useAuth();
  const { resumeSave } = useLocalSearchParams<{ resumeSave?: string }>();
  const {
    behaviorDirection,
    behaviorText,
    currency,
    definitionText,
    durationWeeks,
    experienceCategory,
    goal,
    invitationMessage,
    measurementMode,
    membershipChoice,
    recipients,
    rewardOrganizer,
    rhythm,
    savedDraftId,
    setMembershipChoice,
    setRecipients,
    setRewardOrganizer,
    setSavedDraftId,
    sitOutAcknowledged,
    stakeAmount,
  } = onboarding;
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [preparedChallengeId, setPreparedChallengeId] = useState<string | null>(null);
  const revealProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const gateProgress = useSharedValue(membershipChoice ? 1 : 0);
  const nextActionProgress = useSharedValue(membershipChoice ? 1 : 0);
  const successRule = calculateSuccessRule(onboarding);

  const validRecipients = recipients.filter((recipient) => recipient.name.trim().length > 0);
  const recipientNames = validRecipients.map((recipient) => recipient.name.trim());
  const recipientNamesText = formatRecipientNames(recipientNames);
  const organizerIsValid = Boolean(
    rewardOrganizer?.type === 'recipient'
      ? validRecipients.some((recipient) => recipient.id === rewardOrganizer.recipientId)
      : rewardOrganizer?.type === 'other' && rewardOrganizer.name.trim().length > 0,
  );
  const categoryLabel = experienceCategory ? CATEGORY_LABELS[experienceCategory] : 'Experience';
  const stakeLabel =
    stakeAmount && Number.isFinite(stakeAmount) && stakeAmount > 0
      ? `$${stakeAmount.toLocaleString('en-US')}`
      : 'Stake not set';
  const stakeCommitmentTitle = stakeAmount
    ? `Your ${stakeLabel} stake is separate.`
    : 'Challenge stake not set.';
  const challengeSummary = successRule?.challengeSummary ?? 'Challenge details are incomplete.';
  const consequenceSummary = `${recipientNamesText} · ${categoryLabel} · ${stakeLabel}`;
  const draftIsValid = Boolean(
    goal.trim().length >= 3 &&
      behaviorText.trim().length >= 3 &&
      durationWeeks &&
      durationWeeks >= 2 &&
      durationWeeks <= 12 &&
      successRule &&
      validRecipients.length > 0 &&
      organizerIsValid &&
      experienceCategory &&
      stakeAmount &&
      Number.isFinite(stakeAmount) &&
      stakeAmount > 0 &&
      sitOutAcknowledged &&
      invitationMessage.trim().length >= 3,
  );
  const trialSelected = membershipChoice === 'monthly_trial';

  useEffect(() => {
    revealProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [reducedMotion, revealProgress]);

  useEffect(() => {
    const target = trialSelected ? 1 : 0;

    if (Platform.OS === 'web') {
      gateProgress.value = target;
      nextActionProgress.value = target;
      return;
    }

    gateProgress.value = withTiming(target, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
    nextActionProgress.value = withTiming(target, {
      duration: reducedMotion ? 120 : 220,
    });
  }, [gateProgress, nextActionProgress, reducedMotion, trialSelected]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - revealProgress.value) * 10 },
    ],
  }));

  const gateStyle = useAnimatedStyle(() => ({
    opacity: 0.48 + gateProgress.value * 0.52,
    transform: [{ scale: reducedMotion ? 1 : 0.96 + gateProgress.value * 0.04 }],
  }));

  const nextActionStyle = useAnimatedStyle(() => ({
    opacity: nextActionProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - nextActionProgress.value) * 8 },
    ],
  }));

  const saveDraft = useCallback(async () => {
    if (!isConfigured) return;
    if (authStatus !== 'signed_in' || !user) {
      setSaveState('signed_out');
      return;
    }
    setSaveState('saving');
    setSaveErrorMessage(null);
    const data: OnboardingDraftData = {
      goal, behaviorText, definitionText, behaviorDirection, measurementMode, rhythm, durationWeeks,
      recipients: recipients.map((recipient) => ({ id: recipient.id, name: recipient.name })),
      rewardOrganizer, experienceCategory, stakeAmount, currency,
      sitOutAcknowledged, invitationMessage,
      // The state update from setMembershipChoice above hasn't re-rendered
      // yet; the trial was just selected, so this save is always for that.
      membershipChoice: 'monthly_trial',
    };
    const result = await saveChallengeDraft({
      data, recipients, existingDraftId: savedDraftId, userId: user.id,
    });
    if (!result.ok) {
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
    // Replace ephemeral local recipient ids with the stable ones the save
    // actually used, so a later save of the same draft (e.g. after "Review
    // membership again") reuses them instead of minting new UUIDs every time.
    const resolved = applyResolvedRecipientIds(recipients, rewardOrganizer, result.recipientIds);
    setRecipients(resolved.recipients);
    setRewardOrganizer(resolved.rewardOrganizer);
    setSavedDraftId(result.draft.id);
    setSaveState('saved');

    // The draft is complete and saved — ask the trusted server boundary to
    // turn it into a server-owned pending_activation commitment. This is
    // idempotent (repeated calls for the same draft return the same
    // challenge), so retrying after an earlier failure here is always safe.
    setSaveState('preparing');
    const prepared = await prepareChallengeFromDraft(result.draft.id, user.id);
    if (!prepared.ok) {
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
    setPreparedChallengeId(prepared.challengeId);
    setSaveState('prepared');
  }, [
    authStatus, behaviorDirection, behaviorText, currency, definitionText, durationWeeks,
    experienceCategory, goal, invitationMessage, isConfigured, measurementMode, recipients,
    rewardOrganizer, rhythm, savedDraftId, setRecipients, setRewardOrganizer, setSavedDraftId,
    sitOutAcknowledged, stakeAmount, user,
  ]);

  const selectTrial = () => {
    if (!draftIsValid || trialSelected) return;
    void playImportantHaptic();
    setMembershipChoice('monthly_trial');
    void saveDraft();
  };

  // Covers the "select trial while signed out -> sign in -> land back here"
  // round trip. /auth redirects back here with resumeSave=1 after a
  // successful sign-in via router.replace, which mounts a brand new instance
  // of this screen — so this can't rely on the earlier instance's local
  // saveState ('signed_out') having survived the trip; it did not.
  // resumedRef makes the retry fire at most once per mount even if this
  // effect re-runs for unrelated reasons (e.g. saveDraft's identity
  // changing as onboarding fields update).
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumeSave !== '1' || resumedRef.current) return;
    // Marked immediately, before checking whether a save is actually due
    // right now, so this can never fire a second time later even if
    // trialSelected/authStatus change again while resumeSave is still '1'.
    resumedRef.current = true;
    if (trialSelected && authStatus === 'signed_in') {
      void saveDraft();
    }
  }, [authStatus, resumeSave, saveDraft, trialSelected]);

  const retrySave = () => {
    void playSelectionHaptic();
    void saveDraft();
  };

  const reviewMembershipAgain = () => {
    void playSelectionHaptic();
    setMembershipChoice(null);
  };

  const previewActiveChallenge = () => {
    if (!draftIsValid || !trialSelected) return;
    void playImportantHaptic();
    router.push('/challenge' as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View aria-hidden pointerEvents="none" style={styles.backgroundGeometry}>
        <View style={styles.deepPlane} />
        <View style={styles.frameLine} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.content, revealStyle]}>
          <View style={styles.header}>
            <View style={styles.brandGroup}>
              <Pressable
                accessibilityHint="Returns to the recipient-page preview"
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.dismissTo('/share/preview' as Href)}
                style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              >
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.wordmark}>KINWIN</Text>
            </View>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.stepLabel}
            >
              3 of 3
            </Text>
          </View>

          <OnboardingProgress
            accessibilityLabel="Share setup, step 3 of 3"
            currentStep={3}
            reducedMotion={reducedMotion}
            settled={trialSelected}
            totalSteps={3}
          />

          <View style={styles.main}>
            <View style={styles.intro}>
              <Text style={styles.phaseLabel}>ACTIVATE &amp; SHARE</Text>
              <Text accessibilityRole="header" style={styles.headline}>
                Ready to make it real?
              </Text>
              <Text style={styles.supportingCopy}>
                Start your Kinwin membership before the recipient link is created and shared.
              </Text>
              <Text style={styles.secondaryCopy}>
                Nothing has been purchased, charged, activated, or sent yet.
              </Text>
            </View>

            <View style={styles.challengeContext}>
              <View aria-hidden style={styles.contextNode} />
              <View style={styles.contextCopy}>
                <Text style={styles.sectionLabel}>READY TO ACTIVATE</Text>
                <Text style={styles.challengeSummary}>{challengeSummary}</Text>
                <Text style={styles.consequenceSummary}>{consequenceSummary}</Text>
              </View>
            </View>

            <Animated.View
              accessibilityLabel={
                trialSelected
                  ? 'Activation gate established. Trial selected locally.'
                  : 'Activation gate. Membership choice required.'
              }
              style={[styles.activationGate, gateStyle]}
            >
              <View aria-hidden style={styles.gateIncomingThread} />
              <View style={[styles.gateNode, trialSelected && styles.gateNodeSelected]}>
                <View aria-hidden style={styles.gateCore} />
              </View>
              <View aria-hidden style={styles.gateOutgoingThread} />
              <Text style={styles.gateLabel}>
                {trialSelected ? 'TRIAL SELECTED' : 'ACTIVATION GATE'}
              </Text>
            </Animated.View>

            <View style={[styles.membershipSection, trialSelected && styles.membershipSelected]}>
              <View style={styles.membershipHeader}>
                <Text style={styles.sectionLabel}>KINWIN MEMBERSHIP</Text>
                {trialSelected && <Text style={styles.selectedLabel}>SELECTED LOCALLY</Text>}
              </View>
              <Text style={styles.trialValue}>7 days free</Text>
              <Text style={styles.monthlyValue}>Then $9.99/month</Text>
              <Text style={styles.membershipValueHeadline}>
                Everything you need to keep the promise.
              </Text>
              <Text style={styles.membershipValueStatement}>
                Kinwin guides your challenge from the first commitment to the final result.
              </Text>
              <View style={styles.membershipJourney}>
                <Text style={styles.journeyLabel}>YOUR MEMBERSHIP INCLUDES</Text>
                <View style={styles.journeySteps}>
                  <View aria-hidden style={styles.journeyThread} />
                  <View style={styles.journeyStep}>
                    <View aria-hidden style={styles.journeyNode} />
                    <View style={styles.journeyCopy}>
                      <Text style={styles.journeyTitle}>Build a clear commitment</Text>
                      <Text style={styles.journeyText}>
                        Turn a meaningful goal into a measurable challenge with a clear success
                        rule.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.journeyStep}>
                    <View aria-hidden style={styles.journeyNode} />
                    <View style={styles.journeyCopy}>
                      <Text style={styles.journeyTitle}>Stay accountable</Text>
                      <Text style={styles.journeyText}>
                        Connect the promise to people who matter and a consequence that feels real.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.journeyStep}>
                    <View aria-hidden style={styles.journeyNode} />
                    <View style={styles.journeyCopy}>
                      <Text style={styles.journeyTitle}>Keep moving</Text>
                      <Text style={styles.journeyText}>
                        Use low-friction check-ins, progress tracking, and guidance throughout the
                        challenge.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.journeyStep}>
                    <View aria-hidden style={[styles.journeyNode, styles.journeyNodeLast]} />
                    <View style={styles.journeyCopy}>
                      <Text style={styles.journeyTitle}>Learn what works</Text>
                      <Text style={styles.journeyText}>
                        Finish with a clear result and keep the lessons that help you succeed again.
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.membershipTerms}>
                <Text style={styles.termText}>Renews monthly until canceled. Cancel anytime.</Text>
                <Text style={styles.periodAccessText}>
                  Full membership remains available until the end of the current trial or billing
                  period.
                </Text>
              </View>
              <Text style={styles.completionSafeguard}>
                If membership ends during an active challenge, essential access remains so the
                challenge can be completed.
              </Text>
            </View>

            <View style={styles.commitmentsSection}>
              <Text style={styles.sectionLabel}>TWO SEPARATE COMMITMENTS</Text>
              <View style={styles.commitmentRow}>
                <View style={styles.commitmentSurface}>
                  <Text style={styles.commitmentLabel}>MEMBERSHIP</Text>
                  <Text style={styles.commitmentTitle}>
                    Access to the complete Kinwin experience.
                  </Text>
                  <Text style={styles.commitmentCopy}>
                    7 days free, then $9.99/month.
                  </Text>
                </View>
                <View style={[styles.commitmentSurface, styles.stakeSurface]}>
                  <Text style={styles.stakeLabel}>CHALLENGE STAKE</Text>
                  <Text style={styles.commitmentTitle}>{stakeCommitmentTitle}</Text>
                  <Text style={styles.commitmentCopy}>
                    It is charged only if this challenge fails.
                  </Text>
                </View>
              </View>
              <Text style={styles.commitmentClarification}>
                The free trial applies to membership—not the stake. Your recipients are never
                asked to pay.
              </Text>
            </View>

            <View style={styles.nextSection}>
              <Text style={styles.sectionLabel}>WHAT HAPPENS NEXT</Text>
              <View style={styles.sequence}>
                <View aria-hidden style={styles.sequenceThread} />
                {NEXT_STEPS.map((step, index) => (
                  <View key={step} style={styles.sequenceStep}>
                    <View aria-hidden style={styles.sequenceNode}>
                      <Text style={styles.sequenceNumber}>{index + 1}</Text>
                    </View>
                    <Text style={styles.sequenceText}>{step}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.linkTimingCopy}>
                The recipient link is not created until the later setup is complete.
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.prototypeClarification}>
              <View aria-hidden style={styles.clarificationMark} />
              <Text style={styles.prototypeText}>
                No subscription, payment method, recipient link, or active challenge has been
                created.
              </Text>
            </View>

            {!trialSelected ? (
              <AnimatedPrimaryButton
                accessibilityHint={
                  draftIsValid
                    ? 'Selects the monthly trial in this local prototype without making a purchase'
                    : 'Complete the challenge and Share draft before selecting the trial'
                }
                disabled={!draftIsValid}
                label="Start 7-day free trial"
                onPress={selectTrial}
                reducedMotion={reducedMotion}
              />
            ) : (
              <Animated.View style={nextActionStyle}>
                <View style={styles.trialSelectedSummary}>
                  <View aria-hidden style={styles.selectedNode} />
                  <View style={styles.selectedCopy}>
                    <Text style={styles.trialSelectedTitle}>Trial selected</Text>
                    <Text style={styles.trialSelectedText}>
                      No purchase was made in this prototype.
                    </Text>
                  </View>
                </View>
                <View accessibilityLiveRegion="polite" style={styles.saveStatusRow}>
                  {saveState === 'saving' && <Text style={styles.saveStatusText}>Saving your draft…</Text>}
                  {saveState === 'preparing' && <Text style={styles.saveStatusText}>Saving your pending commitment on the server…</Text>}
                  {saveState === 'prepared' && <Text style={styles.saveStatusSuccess}>Pending commitment saved on the server. You can continue later.</Text>}
                  {saveState === 'signed_out' && (
                    <Pressable
                      accessibilityHint="Opens sign in, then returns here to save your progress"
                      accessibilityRole="button"
                      onPress={() => router.push('/auth?returnTo=/share/activate' as Href)}
                    >
                      <Text style={styles.saveStatusAction}>Sign in to save your progress</Text>
                    </Pressable>
                  )}
                  {saveState === 'error' && (
                    <View style={styles.saveStatusErrorRow}>
                      <Text style={styles.saveStatusError}>{saveErrorMessage ?? 'Could not save your draft.'}</Text>
                      <Pressable accessibilityHint="Retries saving your draft and pending commitment" accessibilityRole="button" onPress={retrySave}>
                        <Text style={styles.saveStatusAction}>Retry</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
                {saveState === 'prepared' && preparedChallengeId && (
                  <View style={styles.pendingCommitmentCopy}>
                    <Text style={styles.pendingCommitmentLabel}>SERVER-SAVED · PENDING COMMITMENT</Text>
                    <Text style={styles.pendingCommitmentText}>
                      The server created a pending commitment record for this challenge. It is not
                      active — payment, recipient link, and sharing still have to happen first.
                    </Text>
                    <Text style={styles.pendingCommitmentReference}>
                      Reference: {preparedChallengeId.slice(0, 8)}…
                    </Text>
                  </View>
                )}
                <Pressable
                  accessibilityHint="Clears only the local membership choice"
                  accessibilityLabel="Review membership again"
                  accessibilityRole="button"
                  onPress={reviewMembershipAgain}
                  style={({ pressed }) => [
                    styles.reviewAction,
                    pressed && styles.reviewActionPressed,
                  ]}
                >
                  <Text style={styles.reviewActionText}>Review membership again</Text>
                </Pressable>
                <View style={styles.prototypeShortcutCopy}>
                  <Text style={styles.prototypeShortcutLabel}>LOCAL PREVIEW ONLY</Text>
                  <Text style={styles.prototypeShortcutText}>
                    Prototype shortcut—skips payment setup, recipient-link creation, sharing, and
                    real activation. It stays entirely on this device, session-only, and is
                    separate from the server-saved pending commitment above.
                  </Text>
                </View>
                <AnimatedPrimaryButton
                  accessibilityHint={
                    draftIsValid
                      ? 'Opens the active challenge preview without purchasing, sharing, or activating anything'
                      : 'Repair the upstream draft before opening the preview'
                  }
                  disabled={!draftIsValid}
                  label="Preview active challenge"
                  onPress={previewActiveChallenge}
                  reducedMotion={reducedMotion}
                />
              </Animated.View>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  backgroundGeometry: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  deepPlane: {
    position: 'absolute', top: 62, right: 12, bottom: 12, left: 12,
    borderRadius: theme.radius.precise, backgroundColor: theme.colors.deepInk, opacity: 0.62,
  },
  frameLine: {
    position: 'absolute', top: 62, right: 12, bottom: 12, left: 12,
    borderWidth: 1, borderColor: theme.colors.structureLine,
    borderRadius: theme.radius.precise, opacity: 0.34,
  },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center',
    paddingHorizontal: 24, paddingTop: 6, paddingBottom: 22,
  },
  header: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  stepLabel: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0.8 },
  main: { gap: 22, paddingTop: 14 },
  intro: { gap: 8 },
  phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 38, fontWeight: '400', letterSpacing: -0.6, lineHeight: 44,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  secondaryCopy: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  sectionLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  challengeContext: {
    minHeight: 94, flexDirection: 'row', alignItems: 'flex-start',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    borderLeftWidth: 2, borderLeftColor: theme.colors.copper,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 15,
  },
  contextNode: { width: 7, height: 7, marginTop: 2, marginRight: 12, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  contextCopy: { flex: 1 },
  challengeSummary: { marginTop: 8, color: theme.colors.bone, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  consequenceSummary: { marginTop: 4, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  activationGate: { minHeight: 70, alignItems: 'center', justifyContent: 'center' },
  gateIncomingThread: { position: 'absolute', top: 0, width: 1, height: 23, backgroundColor: theme.colors.copper },
  gateNode: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: 14, backgroundColor: theme.colors.surfaceRaised,
  },
  gateNodeSelected: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperDeep },
  gateCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  gateOutgoingThread: { position: 'absolute', top: 50, width: 1, height: 20, backgroundColor: theme.colors.copper },
  gateLabel: { position: 'absolute', top: 28, left: '57%', color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  membershipSection: {
    borderTopWidth: 1, borderBottomWidth: 1,
    borderTopColor: theme.colors.copper, borderBottomColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 20, paddingVertical: 20,
  },
  membershipSelected: { borderTopColor: theme.colors.copperBright, backgroundColor: '#251B16' },
  membershipHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selectedLabel: { color: theme.colors.copperBright, fontSize: 8, fontWeight: '800', letterSpacing: 1.05 },
  trialValue: {
    marginTop: 18, color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 34, lineHeight: 40,
  },
  monthlyValue: { marginTop: 3, color: theme.colors.copperBright, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  membershipValueHeadline: {
    marginTop: 18,
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 20,
    lineHeight: 26,
  },
  membershipValueStatement: { marginTop: 6, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  membershipJourney: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: theme.colors.structureLine,
    paddingTop: 15,
  },
  journeyLabel: { color: theme.colors.copper, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  journeySteps: { position: 'relative', marginTop: 13 },
  journeyThread: {
    position: 'absolute', top: 7, bottom: 23, left: 4, width: 1,
    backgroundColor: theme.colors.copper, opacity: 0.68,
  },
  journeyStep: { minHeight: 58, flexDirection: 'row', alignItems: 'flex-start' },
  journeyNode: {
    zIndex: 1, width: 9, height: 9, marginTop: 3, marginRight: 13,
    borderWidth: 1, borderColor: theme.colors.copperBright,
    borderRadius: 5, backgroundColor: theme.colors.copperDeep,
  },
  journeyNodeLast: { backgroundColor: theme.colors.copperBright },
  journeyCopy: { flex: 1 },
  journeyTitle: { color: theme.colors.bone, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  journeyText: { marginTop: 3, color: theme.colors.boneMuted, fontSize: 10, lineHeight: 15 },
  membershipTerms: { borderTopWidth: 1, borderTopColor: theme.colors.structureLine, paddingTop: 12, gap: 4 },
  termText: { color: theme.colors.boneMuted, fontSize: 11, fontWeight: '700', lineHeight: 17 },
  periodAccessText: { color: theme.colors.warmGrey, fontSize: 10, lineHeight: 16 },
  completionSafeguard: { marginTop: 11, color: theme.colors.warmGrey, fontSize: 9, lineHeight: 14 },
  commitmentsSection: { gap: 12 },
  commitmentRow: { flexDirection: 'row', gap: 9 },
  commitmentSurface: {
    flex: 1, minHeight: 168, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surface, paddingHorizontal: 13, paddingVertical: 15,
  },
  stakeSurface: { borderColor: theme.colors.copper, backgroundColor: theme.colors.copperDeep },
  commitmentLabel: { color: theme.colors.boneMuted, fontSize: 8, fontWeight: '800', letterSpacing: 1.05 },
  stakeLabel: { color: theme.colors.copperBright, fontSize: 8, fontWeight: '800', letterSpacing: 1.05 },
  commitmentTitle: { marginTop: 11, color: theme.colors.bone, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  commitmentCopy: { marginTop: 8, color: theme.colors.boneMuted, fontSize: 10, lineHeight: 16 },
  commitmentClarification: { color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  nextSection: { borderTopWidth: 1, borderTopColor: theme.colors.structureLine, paddingTop: 18 },
  sequence: { position: 'relative', marginTop: 16, paddingLeft: 2 },
  sequenceThread: { position: 'absolute', top: 14, bottom: 14, left: 15, width: 1, backgroundColor: theme.colors.copper, opacity: 0.72 },
  sequenceStep: { minHeight: 50, flexDirection: 'row', alignItems: 'flex-start' },
  sequenceNode: {
    zIndex: 1, width: 27, height: 27, alignItems: 'center', justifyContent: 'center',
    marginRight: 14, borderWidth: 1, borderColor: theme.colors.copper,
    borderRadius: 14, backgroundColor: theme.colors.deepInk,
  },
  sequenceNumber: { color: theme.colors.copperBright, fontSize: 10, fontWeight: '800' },
  sequenceText: { flex: 1, paddingTop: 5, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  linkTimingCopy: { marginTop: 5, color: theme.colors.warmGrey, fontSize: 10, lineHeight: 16 },
  footer: { marginTop: 24 },
  prototypeClarification: {
    minHeight: 62, flexDirection: 'row', alignItems: 'center',
    marginBottom: 16, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  clarificationMark: { width: 17, height: 1, marginRight: 12, backgroundColor: theme.colors.copper },
  prototypeText: { flex: 1, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  trialSelectedSummary: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.copper,
    backgroundColor: theme.colors.copperDeep, paddingHorizontal: 14, paddingVertical: 12,
  },
  selectedNode: { width: 7, height: 7, marginRight: 12, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  selectedCopy: { flex: 1 },
  trialSelectedTitle: { color: theme.colors.bone, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  trialSelectedText: { marginTop: 3, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 16 },
  saveStatusRow: { minHeight: 22, marginTop: 10, paddingHorizontal: 2 },
  saveStatusText: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 17 },
  saveStatusSuccess: { color: theme.colors.copperBright, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  saveStatusAction: { color: theme.colors.copperBright, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  saveStatusErrorRow: { gap: 4 },
  saveStatusError: { color: '#E37D6A', fontSize: 12, lineHeight: 17 },
  pendingCommitmentCopy: {
    marginTop: 10, borderLeftWidth: 2, borderLeftColor: theme.colors.copperBright,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 10,
  },
  pendingCommitmentLabel: {
    color: theme.colors.copperBright, fontSize: 8, fontWeight: '800', letterSpacing: 1.2,
  },
  pendingCommitmentText: {
    marginTop: 5, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17,
  },
  pendingCommitmentReference: {
    marginTop: 6, color: theme.colors.warmGrey, fontSize: 10, lineHeight: 15,
  },
  reviewAction: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  reviewActionPressed: { backgroundColor: theme.colors.surface },
  reviewActionText: { color: theme.colors.copperBright, fontSize: 12, fontWeight: '700' },
  prototypeShortcutCopy: {
    marginBottom: 14, borderTopWidth: 1, borderTopColor: theme.colors.structureLine,
    paddingHorizontal: 4, paddingTop: 12,
  },
  prototypeShortcutLabel: {
    color: theme.colors.copper, fontSize: 8, fontWeight: '800', letterSpacing: 1.2,
  },
  prototypeShortcutText: {
    marginTop: 5, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17,
  },
});
