import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { RealCheckInSheetV2 } from '@/components/v2/real-check-in-sheet';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useRealActiveChallenge } from '@/hooks/use-real-active-challenge';
import { describeChallengeIdentity, describeUpcomingStart, statusTone } from '@/lib/home/challenge-summary';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { cancelPendingChallenge, fetchPendingCommitment, PendingCommitment } from '@/lib/supabase/challenge-repository';

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
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [pendingCommitment, setPendingCommitment] = useState<PendingCommitment | null>(null);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [startOverSheetOpen, setStartOverSheetOpen] = useState(false);
  const [startingOver, setStartingOver] = useState(false);

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

  useFocusEffect(useCallback(() => { void loadPendingCommitment(); }, [loadPendingCommitment]));
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const createChallenge = () => {
    if (pendingCommitment) {
      void playSelectionHaptic();
      router.push('/account/pending-commitment' as Href);
      return;
    }
    void playImportantHaptic();
    onboarding.resetDraft();
    router.push('/create/intro' as Href);
  };

  const openStartOverSheet = () => {
    void playSelectionHaptic();
    setStartOverSheetOpen(true);
  };

  const confirmStartOver = async () => {
    if (!pendingCommitment || !user) return;
    setStartingOver(true);
    const result = await cancelPendingChallenge(pendingCommitment.challengeId, user.id);
    setStartingOver(false);
    if (!result.ok) return;
    void playImportantHaptic();
    setStartOverSheetOpen(false);
    setPendingCommitment(null);
    onboarding.resetDraft();
    router.push('/create/intro' as Href);
  };

  const shareActiveChallenge = async () => {
    if (real.status !== 'ready') return;
    void playSelectionHaptic();
    const { challenge } = real.data;
    const identity = describeChallengeIdentity(challenge);
    const recipientNames = challenge.recipients.map((recipient) => recipient.name).join(', ') || 'them';
    const message =
      `Hi! I am keeping a Kinwin challenge: ${identity.headline}.\n\n` +
      `If I don't keep it, ${recipientNames} could receive a reward funded by my stake. I will not take part.`;
    await Share.share({ message });
  };

  const onRealCheckInSubmitted = useCallback(() => {
    void refresh();
  }, [refresh]);

  const isLoading = real.status === 'loading' || pendingLoading;
  const focusPeriod = real.status === 'ready'
    ? real.data.periods.find((period) => period.id === real.view.focusPeriodId) ?? null
    : null;
  const isUpcoming = real.status === 'ready' && real.view.currentPeriodStatus.kind === 'upcoming';
  const isComplete = real.status === 'ready' && real.view.finalResult !== null;
  const identity = real.status === 'ready' ? describeChallengeIdentity(real.data.challenge) : null;

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
                    <Text style={[styles.heroStatus, HERO_STATUS_TONE_STYLE[real.view.finalResult!.status === 'success' ? 'success' : 'failure']]}>
                      {real.view.finalResult!.status === 'success' ? 'Challenge complete. You kept it.' : 'Challenge complete.'}
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
                    {!isUpcoming && Boolean(real.view.timeRemaining) && (
                      <Text style={styles.heroTimeRemaining}>{real.view.timeRemaining}</Text>
                    )}
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
                  </>
                )}

                <View style={styles.heroLinks}>
                  <Pressable accessibilityHint="Opens the full challenge detail" accessibilityRole="button" hitSlop={6} onPress={openDetail} style={styles.heroLink}>
                    <Text style={styles.heroLinkText}>View details</Text>
                  </Pressable>
                  <Pressable accessibilityHint="Opens your phone's share sheet with your invitation again" accessibilityRole="button" hitSlop={6} onPress={() => void shareActiveChallenge()} style={styles.heroLink}>
                    <Text style={styles.heroLinkText}>Share invite again</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {!isLoading && real.status !== 'ready' && real.status !== 'error' && (
            <View style={styles.emptySection}>
              <Text style={styles.emptyTitle}>{pendingCommitment ? 'Your challenge is almost ready.' : 'No active challenge yet.'}</Text>
              <Text style={styles.emptyBody}>
                {pendingCommitment ? 'Finish setting it up to activate it.' : 'Create one to see it here.'}
              </Text>
            </View>
          )}

          {!isLoading && real.status === 'error' && (
            <View style={styles.emptySection}>
              <Text style={styles.emptyTitle}>Could not load your challenge.</Text>
              <Pressable accessibilityHint="Tries loading your challenge again" accessibilityRole="button" hitSlop={6} onPress={() => void refresh()} style={styles.retryLink}>
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

        {!isLoading && real.status === 'ready' && isComplete && (
          <View style={styles.createSection}>
            <PrimaryButtonV2
              accessibilityHint={pendingCommitment ? 'Opens your unfinished commitment' : 'Starts setting up a new challenge'}
              label={pendingCommitment ? 'Continue setup' : '+ Create challenge'}
              onPress={createChallenge}
              reducedMotion={reducedMotion}
            />
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
  heroLinks: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  heroLink: { minHeight: 32, justifyContent: 'center' },
  heroLinkText: { color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '600' },
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
