import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarV2 } from '@/components/v2/avatar';
import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { ProgressBarV2 } from '@/components/v2/stat-bar';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { RealCheckInSheetV2 } from '@/components/v2/real-check-in-sheet';
import { ResumeCreationSheetV2 } from '@/components/v2/resume-creation-sheet';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useCreateChallengeEntry } from '@/hooks/use-create-challenge-entry';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useRealActiveChallenge } from '@/hooks/use-real-active-challenge';
import { useRecentCompletedChallenge } from '@/hooks/use-recent-completed-challenge';
import { describeActivityEvent } from '@/lib/home/activity-summary';
import {
  computeHeroProgressPercent,
  describeChallengeIdentity,
  describeConsequence,
  describeDurationPosition,
  describeProgress,
  describeUpcomingStart,
  statusTone,
} from '@/lib/home/challenge-summary';
import { chooseHomeChallengeSurface, describeChallengeResult, formatCompletedDate, shouldRefreshCompletedAfterActiveTransition } from '@/lib/home/completed-challenge';
import { describeOwnerPaymentStatus } from '@/lib/payment-journey';
import { describeOwnerRewardStatus, formatPeople } from '@/lib/reward-journey';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { cancelPendingChallenge, fetchPendingCommitment, PendingCommitment } from '@/lib/supabase/challenge-repository';
import { ActivityItem, clearMyReaction, fetchKinActivity, fetchKinCurrentChallenges, KinCurrentChallenge, ReactionKind, setMyReaction } from '@/lib/supabase/kin-repository';

// The single default reaction Home's one-tap control applies when the item
// has no reaction yet — the lightest possible acknowledgment gesture. The
// Kin tab's full ReactionBarV2 (any of the five emoji, via its "+" picker)
// remains the only place to pick a different one; Home stays a one-tap
// affordance, never a second reaction picker.
const HOME_DEFAULT_REACTION: ReactionKind = '❤️';

type KinHomeItem =
  | { readonly kind: 'event'; readonly key: string; readonly item: ActivityItem }
  | { readonly kind: 'current'; readonly key: string; readonly item: KinCurrentChallenge };

const HERO_STATUS_TONE_STYLE = StyleSheet.create({
  neutral: { color: theme.colors.ivoryMuted },
  success: { color: theme.colors.sage },
  failure: { color: theme.colors.crimsonBright },
});

function greetingWord() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeV2() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { profile, user } = useAuth();
  const onboarding = useOnboarding();
  const { state: real, refresh } = useRealActiveChallenge();
  const { state: completed, refresh: refreshCompleted } = useRecentCompletedChallenge();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [pendingCommitment, setPendingCommitment] = useState<PendingCommitment | null>(null);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [startOverSheetOpen, setStartOverSheetOpen] = useState(false);
  const [startingOver, setStartingOver] = useState(false);
  const [kinActivity, setKinActivity] = useState<readonly ActivityItem[]>([]);
  const [kinCurrentChallenges, setKinCurrentChallenges] = useState<readonly KinCurrentChallenge[]>([]);
  const [reactingActivityIds, setReactingActivityIds] = useState<Set<string>>(new Set());
  // Synchronous mutex for rapid double-taps — see the identical pattern and
  // rationale on app/home/kin.tsx's own reactionInFlightRef.
  const homeReactionInFlightRef = useRef<Set<string>>(new Set());
  const createChallengeEntry = useCreateChallengeEntry();
  const { refreshResumableSession } = createChallengeEntry;

  const firstName = profile?.displayName?.trim() || user?.email?.split('@')[0] || 'there';

  const loadPendingCommitment = useCallback(async () => {
    if (!user) {
      setPendingCommitment(null);
      setPendingLoading(false);
      return;
    }
    const result = await fetchPendingCommitment(user.id);
    setPendingCommitment(result.ok ? result.commitment : null);
    setPendingLoading(false);
  }, [user]);

  // Small, restrained module only — capped at 3 items, no "load more". If
  // there is nothing to show, the whole section is simply absent (see
  // docs/PRODUCT_DECISIONS.md's Home hierarchy note): never a giant empty
  // "your Kin's activity will appear here" block competing with the user's
  // own challenge for attention. Also fetches current Kin state (what a
  // Kin is doing right now, not just recent events) so a Kin who already
  // had an active challenge before the relationship existed still shows
  // up here — see get_kin_current_challenges' own migration comment.
  const loadKinActivity = useCallback(async () => {
    if (!user) { setKinActivity([]); setKinCurrentChallenges([]); return; }
    const [activityResult, currentResult] = await Promise.all([fetchKinActivity(user.id, 3), fetchKinCurrentChallenges(user.id)]);
    setKinActivity(activityResult.ok ? activityResult.items : []);
    setKinCurrentChallenges(currentResult.ok ? currentResult.challenges : []);
  }, [user]);

  useFocusEffect(useCallback(() => { void loadPendingCommitment(); }, [loadPendingCommitment]));
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useFocusEffect(useCallback(() => { void refreshCompleted(); }, [refreshCompleted]));
  // A check-in submitted while sitting on Home can finalize the challenge
  // server-side moments later (useRealActiveChallenge's own fire-and-forget
  // finalize call) — real.status quietly goes ready -> none in the
  // background, with no focus event to trigger the usual refetch above.
  // Without this, Home would flash the empty "No active challenge yet"
  // state instead of the real completed-challenge card until the user next
  // leaves and returns. See shouldRefreshCompletedAfterActiveTransition's
  // own comment for exactly which transition this catches.
  const previousRealStatusRef = useRef(real.status);
  useEffect(() => {
    if (shouldRefreshCompletedAfterActiveTransition(previousRealStatusRef.current, real.status)) {
      void refreshCompleted();
    }
    previousRealStatusRef.current = real.status;
  }, [real.status, refreshCompleted]);
  useFocusEffect(useCallback(() => { void loadKinActivity(); }, [loadKinActivity]));
  // Re-checked on every return to Home (not just once) — creation-session
  // autosave writes and clears happen entirely inside app/create/*, so
  // Home only learns about them by re-reading when it regains focus.
  useFocusEffect(useCallback(() => { refreshResumableSession(); }, [refreshResumableSession]));

  const createChallenge = () => createChallengeEntry.requestCreateChallenge(Boolean(pendingCommitment));

  const openStartOverSheet = () => {
    void playSelectionHaptic();
    setStartOverSheetOpen(true);
  };

  const confirmStartOver = async () => {
    if (!pendingCommitment || !user) return;
    setStartingOver(true);
    const result = await cancelPendingChallenge(pendingCommitment.challengeId, user.id);
    setStartingOver(false);
    if (!result.ok) {
      // The sheet stays open and the button re-enables silently without
      // this — cancel_pending_challenge is idempotent, so it's always safe
      // to just let the user tap "Start over" again.
      Alert.alert('Could not start over', 'message' in result ? result.message : 'Please try again.');
      return;
    }
    void playImportantHaptic();
    setStartOverSheetOpen(false);
    setPendingCommitment(null);
    onboarding.resetDraft();
    router.push('/create/intro' as Href);
  };

  const openRecipientInvites = () => {
    if (real.status !== 'ready') return;
    void playSelectionHaptic();
    router.push('/home/challenge' as Href);
  };

  const onRealCheckInSubmitted = useCallback(() => {
    void refresh();
  }, [refresh]);

  const homeSurface = chooseHomeChallengeSurface(real.status, completed.status);
  const isLoading = homeSurface === 'loading' || pendingLoading;
  const focusPeriod = real.status === 'ready'
    ? real.data.periods.find((period) => period.id === real.view.focusPeriodId) ?? null
    : null;
  const isUpcoming = real.status === 'ready' && real.view.currentPeriodStatus.kind === 'upcoming';
  // Client-computed finalResult and the server's own awaiting_resolution
  // status are two independent signals for "no longer ordinary active" —
  // either can arrive first (finalResult on a not-yet-reconciled row, or
  // awaiting_resolution on a genuinely not_evaluable edge case), so treat
  // either as enough to leave the ordinary in-progress hero. This never
  // implies the outcome is finalized: the challenge row here is still
  // whatever fetchActiveChallenge returned (active or awaiting_resolution),
  // never a truly terminal completed_success/completed_failure row.
  const isComplete =
    real.status === 'ready' && (real.view.finalResult !== null || real.data.challenge.status === 'awaiting_resolution');
  const identity = real.status === 'ready' ? describeChallengeIdentity(real.data.challenge) : null;
  // Real, honestly-computable progress only — the same adapter the
  // challenge detail screen already uses (lib/home/challenge-summary.ts),
  // never a fabricated streak/score. periodsTotal is 0 for a just-activated
  // challenge whose periods haven't generated yet, hence the guard.
  const durationPosition = real.status === 'ready' ? describeDurationPosition(focusPeriod, real.view.progress.periodsTotal) : null;
  const progressLine = real.status === 'ready'
    ? describeProgress(real.data.challenge, real.view.currentPeriodStatus, real.view.progress, focusPeriod)
    : null;
  const progressPercent = real.status === 'ready'
    ? computeHeroProgressPercent(real.view.direction, real.view.progress.periodsClosed, real.view.progress.periodsTotal)
    : null;
  // Restrained secondary reminder (Section 15) — real stake snapshot data,
  // never phrased as a threat, never showing the owner as a beneficiary.
  const consequence = real.status === 'ready' ? describeConsequence(real.data.challenge) : null;
  const completedIdentity = completed.status === 'ready' ? describeChallengeIdentity(completed.data.snapshot) : null;
  const completedPresentation = completed.status === 'ready' ? describeChallengeResult(completed.data.status) : null;
  const completedRewardPresentation = completed.status === 'ready' && completed.data.rewardProgress ? describeOwnerRewardStatus(completed.data.rewardProgress) : null;
  const completedPaymentPresentation = completed.status === 'ready' && completed.data.paymentStatus ? describeOwnerPaymentStatus(completed.data.paymentStatus) : null;

  // Recent real events first; only fill remaining slots with current Kin
  // state for a challenge no fetched event already covers, so the same
  // challenge is never shown twice. Never fabricates an event — a
  // current-state item always renders as present-tense state, not as if
  // something just happened.
  //
  // fetchKinActivity itself excludes the viewer's own activity (Kin-only,
  // by design — see its own doc comment in lib/supabase/kin-repository.ts),
  // so no additional filtering is needed here.
  const eventChallengeIds = new Set(kinActivity.map((item) => item.challengeId).filter((id): id is string => id !== null));
  const kinHomeItems: readonly KinHomeItem[] = [
    ...kinActivity.map((item): KinHomeItem => ({ kind: 'event', key: item.id, item })),
    ...kinCurrentChallenges
      .filter((c) => !eventChallengeIds.has(c.challengeId))
      .map((item): KinHomeItem => ({ kind: 'current', key: item.challengeId, item })),
  ].slice(0, 3);

  // The lightest interaction available directly on Home — one tap. Shows
  // and toggles whatever reaction is already there (from any surface), or
  // applies HOME_DEFAULT_REACTION when there is none yet. Never opens a
  // picker: choosing a different specific emoji stays a Kin-tab action, and
  // comments are never composable from Home at all — see this package's own
  // "From your Kin" scope note.
  const toggleHomeReaction = async (item: ActivityItem) => {
    if (!user || homeReactionInFlightRef.current.has(item.id)) return;
    homeReactionInFlightRef.current.add(item.id);
    void playSelectionHaptic();
    setReactingActivityIds((current) => new Set(current).add(item.id));
    try {
      const targetKind = (item.myReaction as ReactionKind | null) ?? HOME_DEFAULT_REACTION;
      const isMine = item.myReaction !== null;
      setKinActivity((current) => current.map((entry) => {
        if (entry.id !== item.id) return entry;
        const counts = { ...entry.reactionCounts };
        if (entry.myReaction) counts[entry.myReaction] = Math.max(0, (counts[entry.myReaction] ?? 1) - 1);
        if (!isMine) counts[targetKind] = (counts[targetKind] ?? 0) + 1;
        return { ...entry, myReaction: isMine ? null : targetKind, reactionCounts: counts };
      }));
      const result = isMine ? await clearMyReaction(user.id, item.id) : await setMyReaction(user.id, item.id, targetKind);
      if (!result.ok) void loadKinActivity();
    } catch {
      void loadKinActivity();
    } finally {
      homeReactionInFlightRef.current.delete(item.id);
      setReactingActivityIds((current) => { const next = new Set(current); next.delete(item.id); return next; });
    }
  };

  const openCheckIn = () => {
    void playSelectionHaptic();
    setCheckInOpen(true);
  };

  const openDetail = () => {
    void playSelectionHaptic();
    router.push('/home/challenge' as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View>
          <View style={styles.header}>
            <Text style={styles.wordmark}>KINWIN</Text>
          </View>
          <Text style={styles.greeting}>{greetingWord()}, {firstName}</Text>

          {!isLoading && real.status === 'ready' && identity && (
            <View style={styles.section}>
              <View style={styles.heroCard}>
                <Text numberOfLines={2} style={styles.heroHeadline}>{identity.headline}</Text>
                {identity.ruleDetail && <Text style={styles.heroRule}>{identity.ruleDetail}</Text>}

                {isComplete ? (
                  <>
                    <Text
                      style={[
                        styles.heroStatus,
                        HERO_STATUS_TONE_STYLE[
                          real.view.finalResult === null ? 'neutral' : real.view.finalResult.status === 'success' ? 'success' : 'failure'
                        ],
                      ]}
                    >
                      {real.view.finalResult === null
                        ? 'Challenge complete.'
                        : real.view.finalResult.status === 'success'
                          ? 'Challenge complete. You kept it.'
                          : 'Challenge complete.'}
                    </Text>
                    <View style={styles.heroAction}>
                      <PrimaryButtonV2 accessibilityHint="Opens the full challenge detail" label="View details" onPress={openDetail} reducedMotion={reducedMotion} />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.heroStatus, HERO_STATUS_TONE_STYLE[isUpcoming ? 'neutral' : statusTone(real.view.currentPeriodStatus.kind)]]}>
                      {isUpcoming && focusPeriod ? describeUpcomingStart(focusPeriod.startsAt, new Date().toISOString(), real.data.challenge.timezone) : real.view.currentPeriodCopy}
                    </Text>
                    {real.view.nextAction.kind !== 'none' && (
                      <View style={styles.heroAction}>
                        <PrimaryButtonV2
                          accessibilityHint="Opens check-in for this challenge"
                          label={real.view.nextAction.label}
                          onPress={openCheckIn}
                          reducedMotion={reducedMotion}
                        />
                      </View>
                    )}
                    {Boolean(real.view.nextAction.detail) && (
                      <Text style={styles.heroDetail}>{real.view.nextAction.detail}</Text>
                    )}

                    {!isUpcoming && progressPercent !== null && (
                      <View style={styles.heroProgress}>
                        <View style={styles.heroProgressHeader}>
                          {durationPosition && <Text style={styles.heroProgressLabel}>{durationPosition}</Text>}
                          {progressLine && <Text style={styles.heroProgressLabel}>{progressLine}</Text>}
                        </View>
                        <ProgressBarV2 percent={progressPercent} />
                      </View>
                    )}
                    {!isUpcoming && Boolean(real.view.timeRemaining) && (
                      <Text style={styles.heroTimeRemaining}>{real.view.timeRemaining}</Text>
                    )}
                  </>
                )}

                {consequence && (
                  <Text style={styles.heroConsequence}>
                    {consequence.stakeLabel} at stake · {consequence.recipientsCompact} · {consequence.categoryLabel}
                  </Text>
                )}

                <View style={styles.heroLinks}>
                  <Pressable accessibilityHint="Opens the full challenge detail" accessibilityRole="button" hitSlop={6} onPress={openDetail} style={styles.heroLink}>
                    <Text style={styles.heroLinkText}>View details</Text>
                  </Pressable>
                  <Pressable accessibilityHint="Opens recipient invitation status and sharing" accessibilityRole="button" hitSlop={6} onPress={openRecipientInvites} style={styles.heroLink}>
                    <Text style={styles.heroLinkText}>Recipient invites</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {!isLoading && homeSurface === 'completed' && completed.status === 'ready' && completedIdentity && completedPresentation && (
            <View style={styles.section}>
              <View style={styles.completedCard}>
                <Text style={styles.completedLabel}>LAST CHALLENGE</Text>
                <Text numberOfLines={2} style={styles.completedHeadline}>{completedIdentity.headline}</Text>
                {completedIdentity.ruleDetail && <Text style={styles.completedRule}>{completedIdentity.ruleDetail}</Text>}
                <Text style={[styles.completedStatus, completedPresentation.tone === 'success' ? styles.completedSuccess : styles.completedFailure]}>
                  {completedPresentation.homeStatus}
                </Text>
                {completed.data.status === 'completed_failure' && <Text style={styles.completedRule}>{formatPeople(completed.data.snapshot.recipients.map((recipient) => recipient.name))} win.</Text>}
                {completedRewardPresentation && <Text style={completedRewardPresentation.tone === 'success' ? styles.completedSuccess : styles.completedRule}>{completedRewardPresentation.label}</Text>}
                {completedPaymentPresentation && <Text style={styles.completedPaymentAttention}>{completedPaymentPresentation.label}</Text>}
                <Text style={styles.completedDate}>Completed {formatCompletedDate(completed.data.completedAt)}</Text>
                {completedPaymentPresentation && (
                  <Pressable
                    accessibilityHint="Opens Stripe's secure payment form to save a new card"
                    accessibilityRole="button"
                    onPress={() => router.push(`/account/payment-recovery?challengeId=${completed.data.id}&returnTo=${encodeURIComponent(`/home/result?id=${completed.data.id}`)}` as Href)}
                    style={({ pressed }) => [styles.resultButton, styles.paymentAttentionButton, pressed && styles.resultButtonPressed]}
                  >
                    <Text style={styles.resultButtonText}>Update payment method</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityHint="Opens the final result for this challenge"
                  accessibilityRole="button"
                  onPress={() => router.push(`/home/result?id=${completed.data.id}` as Href)}
                  style={({ pressed }) => [styles.resultButton, pressed && styles.resultButtonPressed]}
                >
                  <Text style={styles.resultButtonText}>View result</Text>
                </Pressable>
              </View>
            </View>
          )}

          {!isLoading && homeSurface === 'empty' && (
            <View style={styles.emptySection}>
              <Text style={styles.emptyTitle}>{pendingCommitment ? 'Your challenge is almost ready.' : 'No active challenge yet.'}</Text>
              <Text style={styles.emptyBody}>
                {pendingCommitment ? 'Finish setting it up to activate it.' : 'Create one to see it here.'}
              </Text>
            </View>
          )}

          {!isLoading && homeSurface === 'error' && (
            <View style={styles.emptySection}>
              <Text style={styles.emptyTitle}>Could not load your challenge.</Text>
              <Pressable accessibilityHint="Tries loading your challenge again" accessibilityRole="button" hitSlop={6} onPress={() => { void refresh(); void refreshCompleted(); }} style={styles.retryLink}>
                <Text style={styles.retryLinkText}>Try again</Text>
              </Pressable>
            </View>
          )}

          {!isLoading && pendingCommitment && real.status === 'ready' && (
            <View style={styles.section}>
              <Pressable
                accessibilityHint="Opens your pending commitment to finish setup"
                accessibilityRole="button"
                onPress={() => router.push('/account/pending-commitment' as Href)}
                style={({ pressed }) => [styles.pendingRow, pressed && styles.pendingRowPressed]}
              >
                <Text numberOfLines={1} style={styles.pendingRowLabel}>Continue setup</Text>
                <Text numberOfLines={1} style={styles.pendingRowValue}>{pendingCommitment.draftData.goal.trim()}</Text>
              </Pressable>
            </View>
          )}

          {kinHomeItems.length > 0 && (
            <View style={styles.section}>
              <View style={styles.kinSectionHeader}>
                <Text style={styles.sectionLabel}>FROM YOUR KIN</Text>
                <Pressable accessibilityHint="Opens the Kin tab's Activity section" accessibilityRole="button" hitSlop={6} onPress={() => { void playSelectionHaptic(); router.push('/home/kin?tab=activity' as Href); }} style={styles.kinSeeAll}>
                  <Text style={styles.kinSeeAllText}>See all</Text>
                </Pressable>
              </View>
              <View style={styles.rowGroup}>
                {kinHomeItems.map((entry) => (
                  <View key={entry.key} style={styles.kinRow}>
                    <AvatarV2 size={32} />
                    <View style={styles.kinRowCopy}>
                      <Text numberOfLines={1} style={styles.kinRowName}>{entry.item.ownerDisplayName}</Text>
                      <Text numberOfLines={1} style={styles.kinRowEvent}>
                        {entry.kind === 'event'
                          ? describeActivityEvent(entry.item)
                          : `Currently doing ${describeChallengeIdentity({ behavior: entry.item.behavior }).headline}`}
                      </Text>
                    </View>
                    {entry.kind === 'event' && (
                      <Pressable
                        accessibilityHint={entry.item.myReaction ? 'Removes your reaction' : 'Adds a quick reaction'}
                        accessibilityRole="button"
                        disabled={reactingActivityIds.has(entry.item.id)}
                        hitSlop={8}
                        onPress={() => void toggleHomeReaction(entry.item)}
                        style={({ pressed }) => [styles.kinRowReaction, Boolean(entry.item.myReaction) && styles.kinRowReactionActive, pressed && styles.kinRowReactionPressed]}
                      >
                        <Text style={styles.kinRowReactionEmoji}>{entry.item.myReaction ?? HOME_DEFAULT_REACTION}</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {!isLoading && real.status !== 'ready' && (
          <View style={styles.createSection}>
            <PrimaryButtonV2
              accessibilityHint={pendingCommitment ? 'Opens your unfinished commitment' : 'Starts setting up a new challenge'}
              label={pendingCommitment ? 'Continue setup' : '+ Create challenge'}
              onPress={createChallenge}
              reducedMotion={reducedMotion}
            />
            {pendingCommitment && (
              <Pressable accessibilityHint="Cancels your unfinished commitment and starts a new one" accessibilityRole="button" hitSlop={6} onPress={openStartOverSheet} style={styles.startOverLink}>
                <Text style={styles.startOverText}>Start over instead</Text>
              </Pressable>
            )}
          </View>
        )}

      </View>

      <BottomSheetV2 onClose={() => setCheckInOpen(false)} reducedMotion={reducedMotion} visible={checkInOpen}>
        {real.status === 'ready' && focusPeriod ? (
          <RealCheckInSheetV2
            challenge={real.data.challenge}
            onClose={() => setCheckInOpen(false)}
            onSubmitted={onRealCheckInSubmitted}
            period={focusPeriod}
          />
        ) : null}
      </BottomSheetV2>

      <BottomSheetV2 onClose={() => setStartOverSheetOpen(false)} reducedMotion={reducedMotion} visible={startOverSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Start over?</Text>
        <Text style={styles.sheetBody}>This cancels your unfinished commitment. No payment will be taken.</Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Keeps your unfinished commitment and closes this sheet"
            accessibilityRole="button"
            onPress={() => setStartOverSheetOpen(false)}
            style={({ pressed }) => [styles.keepButton, pressed && styles.keepButtonPressed]}
          >
            <Text style={styles.keepButtonLabel}>Keep it</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Cancels the unfinished commitment and starts a new challenge"
            accessibilityRole="button"
            disabled={startingOver}
            onPress={() => void confirmStartOver()}
            style={({ pressed }) => [styles.destructiveButton, pressed && styles.destructiveButtonPressed]}
          >
            <Text style={styles.destructiveButtonLabel}>{startingOver ? 'Starting over…' : 'Start over'}</Text>
          </Pressable>
        </View>
      </BottomSheetV2>

      <ResumeCreationSheetV2
        confirmingDiscard={createChallengeEntry.confirmingDiscard}
        discardFailed={createChallengeEntry.discardFailed}
        discardingSession={createChallengeEntry.discardingSession}
        onCancelDiscard={createChallengeEntry.cancelDiscardConfirmation}
        onClose={createChallengeEntry.closeResumeSheet}
        onConfirmDiscard={() => void createChallengeEntry.confirmDiscardResumableSession()}
        onContinue={createChallengeEntry.continueResumableSession}
        onRequestDiscard={createChallengeEntry.requestDiscardConfirmation}
        reducedMotion={reducedMotion}
        resumableSummary={createChallengeEntry.resumableSummary}
        visible={createChallengeEntry.resumeSheetOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
  },
  header: { minHeight: 32, flexDirection: 'row', alignItems: 'center' },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  greeting: { marginTop: theme.spacing.small, color: theme.colors.ivory, fontSize: 22, fontWeight: '600' },
  section: { marginTop: theme.spacing.medium },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  kinSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  kinSeeAll: { minHeight: 28, justifyContent: 'center' },
  kinSeeAllText: { color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '600' },
  rowGroup: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  kinRow: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine,
  },
  kinRowCopy: { flex: 1 },
  kinRowName: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700' },
  kinRowEvent: { color: theme.colors.ivoryMuted, fontSize: 12 },
  kinRowReaction: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
    borderRadius: 15, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised, opacity: 0.55,
  },
  kinRowReactionActive: { opacity: 1, borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  kinRowReactionPressed: { opacity: 0.8 },
  kinRowReactionEmoji: { fontSize: 14 },
  heroCard: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.oxblood,
    backgroundColor: theme.colors.surfaceRaised, padding: theme.spacing.medium, gap: 6,
  },
  heroHeadline: { color: theme.colors.ivory, fontSize: 23, fontWeight: '700', lineHeight: 28 },
  heroRule: { color: theme.colors.ivoryMuted, fontSize: 15, fontWeight: '600' },
  heroStatus: { marginTop: 6, fontSize: 14, fontWeight: '700' },
  heroTimeRemaining: { color: theme.colors.warmGrey, fontSize: 12 },
  heroDetail: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 17 },
  heroAction: { marginTop: 6 },
  heroProgress: { marginTop: 10, gap: 6 },
  heroProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  heroProgressLabel: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '700' },
  heroConsequence: { marginTop: 10, color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '600' },
  heroLinks: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  heroLink: { minHeight: 32, justifyContent: 'center' },
  heroLinkText: { color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '600' },
  completedCard: { borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surfaceRaised, padding: theme.spacing.medium, gap: 6 },
  completedLabel: { color: theme.colors.rosewood, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  completedHeadline: { color: theme.colors.ivory, fontFamily: 'Georgia', fontSize: 22, lineHeight: 27, marginTop: 3 },
  completedRule: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  completedStatus: { fontSize: 14, fontWeight: '800', marginTop: 7 },
  completedSuccess: { color: theme.colors.sage },
  completedFailure: { color: theme.colors.ivory },
  completedDate: { color: theme.colors.warmGrey, fontSize: 12 },
  completedPaymentAttention: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '800' },
  paymentAttentionButton: { backgroundColor: theme.colors.oxblood },
  resultButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled, backgroundColor: theme.colors.rosewood, marginTop: 10 },
  resultButtonPressed: { opacity: 0.82 },
  resultButtonText: { color: theme.colors.ivory, fontSize: 14, fontWeight: '800' },
  emptySection: { marginTop: theme.spacing.large, gap: theme.spacing.xsmall },
  emptyTitle: { color: theme.colors.ivory, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: theme.colors.ivoryMuted, fontSize: 13 },
  retryLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  retryLinkText: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  pendingRow: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  pendingRowPressed: { opacity: 0.7 },
  pendingRowLabel: { color: theme.colors.ivory, fontSize: 14, fontWeight: '600' },
  pendingRowValue: { flexShrink: 1, marginLeft: 12, color: theme.colors.ivoryMuted, fontSize: 13, textAlign: 'right' },
  createSection: { gap: 10 },
  startOverLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  startOverText: { color: theme.colors.warmGrey, fontSize: 13, fontWeight: '600' },
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
