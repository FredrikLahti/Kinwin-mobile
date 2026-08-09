import { Feather } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { DemoCheckInSheetV2 } from '@/components/v2/demo-check-in-sheet';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { ProgressDotsV2 } from '@/components/v2/progress-dots';
import { RealCheckInSheetV2 } from '@/components/v2/real-check-in-sheet';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { useUXV2Preview } from '@/contexts/ux-v2-preview-context';
import { demoHomeKinEvents, demoMonthProgress, demoOtherChallenges, demoTodayChallenge } from '@/fixtures/ux-v2-preview';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useRealActiveChallenge } from '@/hooks/use-real-active-challenge';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { cancelPendingChallenge, fetchPendingCommitment, PendingCommitment } from '@/lib/supabase/challenge-repository';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'adventure',
  culture: 'culture',
  dinner: 'dinner',
  getaway: 'getaway',
  wellness: 'wellness',
};

function greetingWord() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// A period that hasn't started yet is a real, expected state (every
// activation's first period starts at the next local midnight — see
// docs/PRODUCT_DECISIONS.md's "Timezone, start, and DST rules" — never the
// activation instant itself, so this is normal on activation day, not an
// error). "Not started yet." alone reads as broken; naming the actual start
// date answers "what do I need to do now?" honestly: nothing, yet.
function formatUpcomingStart(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function HomeV2() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { profile, user } = useAuth();
  const onboarding = useOnboarding();
  const { demoEnabled, toggleDemo } = useUXV2Preview();
  const { state: real, refresh } = useRealActiveChallenge();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [pendingCommitment, setPendingCommitment] = useState<PendingCommitment | null>(null);
  const [startOverSheetOpen, setStartOverSheetOpen] = useState(false);
  const [startingOver, setStartingOver] = useState(false);

  const firstName = profile?.displayName?.trim() || user?.email?.split('@')[0] || 'there';
  const hasRealChallenge = real.status === 'ready';
  const showToday = demoEnabled || hasRealChallenge;

  const loadPendingCommitment = useCallback(async () => {
    if (!user) {
      setPendingCommitment(null);
      return;
    }
    const result = await fetchPendingCommitment(user.id);
    setPendingCommitment(result.ok ? result.commitment : null);
  }, [user]);

  useFocusEffect(useCallback(() => { void loadPendingCommitment(); }, [loadPendingCommitment]));

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
    const recipientNames = challenge.recipients.map((recipient) => recipient.name).join(', ') || 'them';
    const stakeLabel = `$${(challenge.stake.minorUnits / 100).toLocaleString('en-US')}`;
    const categoryLabel = CATEGORY_LABELS[challenge.consequenceCategory];
    const message =
      `Hi! I am keeping a Kinwin challenge: ${challenge.behavior.description}.\n\n` +
      `If I do not keep it, ${recipientNames} could receive a ${categoryLabel} experience funded by my ${stakeLabel} stake. I will not take part.`;
    await Share.share({ message });
  };

  const onRealCheckInSubmitted = useCallback(() => {
    void refresh();
  }, [refresh]);

  const focusPeriod = real.status === 'ready'
    ? real.data.periods.find((period) => period.id === real.view.focusPeriodId) ?? null
    : null;
  const canCheckIn = real.status === 'ready' && real.view.nextAction.kind !== 'none';

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View>
          <View style={styles.header}>
            <Text style={styles.wordmark}>KINWIN</Text>
            <Pressable
              accessibilityHint="Toggles representative demo content for UX v2 visual review"
              accessibilityRole="button"
              accessibilityState={{ selected: demoEnabled }}
              hitSlop={8}
              onPress={() => { void playSelectionHaptic(); toggleDemo(); }}
              style={[styles.demoPill, demoEnabled && styles.demoPillActive]}
            >
              <Text style={[styles.demoPillText, demoEnabled && styles.demoPillTextActive]}>DEMO</Text>
            </Pressable>
          </View>
          <Text style={styles.greeting}>{greetingWord()}, {firstName}</Text>

          {showToday ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TODAY</Text>
              <View style={styles.todayCard}>
                <Text numberOfLines={1} style={styles.challengeName}>
                  {demoEnabled ? demoTodayChallenge.name : real.status === 'ready' ? real.view.promise : ''}
                </Text>
                <Text style={styles.progressLine}>
                  {demoEnabled
                    ? demoTodayChallenge.progressLine
                    : real.status === 'ready'
                      ? (real.view.currentPeriodStatus.kind === 'upcoming' && focusPeriod
                          ? `Starts ${formatUpcomingStart(focusPeriod.startsAt)}`
                          : real.view.currentPeriodCopy)
                      : ''}
                </Text>
                {demoEnabled ? (
                  <ProgressDotsV2 filled={demoTodayChallenge.filled} total={demoTodayChallenge.total} />
                ) : (
                  focusPeriod?.target.type === 'completion_target' && (
                    <ProgressDotsV2
                      filled={
                        real.status === 'ready' && real.view.currentPeriodStatus.kind !== 'upcoming'
                          && 'fact' in real.view.currentPeriodStatus && real.view.currentPeriodStatus.fact?.kind === 'build_completion'
                          ? real.view.currentPeriodStatus.fact.completions
                          : 0
                      }
                      total={focusPeriod.target.target}
                    />
                  )
                )}
                {(demoEnabled || canCheckIn) && (
                  <View style={styles.checkInButton}>
                    <PrimaryButtonV2
                      accessibilityHint="Opens check-in for this challenge"
                      label={demoEnabled ? 'Check in' : (real.status === 'ready' ? real.view.nextAction.label || 'Check in' : 'Check in')}
                      onPress={() => setCheckInOpen(true)}
                      reducedMotion={reducedMotion}
                    />
                  </View>
                )}
                {!demoEnabled && real.status === 'ready' && (
                  <Pressable accessibilityHint="Opens your phone's share sheet with your invitation again" accessibilityRole="button" onPress={() => void shareActiveChallenge()} style={styles.shareAgainLink}>
                    <Text style={styles.shareAgainText}>Share invite again</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptyTitle}>
                {real.status === 'error' ? 'Could not load your challenge.' : 'No active challenge yet.'}
              </Text>
              <Text style={styles.emptyBody}>
                {real.status === 'error' ? real.message : 'Create one to see it here.'}
              </Text>
            </View>
          )}

          {!demoEnabled && pendingCommitment && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SETUP</Text>
              <Pressable
                accessibilityHint="Opens your pending commitment to finish setup"
                accessibilityRole="button"
                onPress={() => router.push('/account/pending-commitment' as Href)}
                style={({ pressed }) => [styles.rowGroup, styles.singleRow, pressed && styles.rowPressed]}
              >
                <Text numberOfLines={1} style={styles.rowLabel}>
                  {pendingCommitment.authorizationStatus === 'authorized' ? 'Ready to activate' : 'Finish payment setup'}
                </Text>
                <View style={styles.rowRight}>
                  <Text numberOfLines={1} style={styles.rowValueMuted}>{pendingCommitment.draftData.goal.trim()}</Text>
                  <Feather color={theme.colors.warmGrey} name="chevron-right" size={16} />
                </View>
              </Pressable>
            </View>
          )}

          {demoEnabled && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>YOUR CHALLENGES</Text>
              <View style={styles.rowGroup}>
                {demoOtherChallenges.map((challenge) => (
                  <Pressable
                    accessibilityHint="Preview row; challenge detail is not built yet"
                    accessibilityRole="button"
                    key={challenge.id}
                    onPress={() => void playSelectionHaptic()}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  >
                    <Text style={styles.rowLabel}>{challenge.name}</Text>
                    <View style={styles.rowRight}>
                      <Text style={styles.rowValue}>{challenge.status}</Text>
                      <Feather color={theme.colors.warmGrey} name="chevron-right" size={16} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {demoEnabled && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>FROM YOUR KIN</Text>
              <View style={styles.rowGroup}>
                {demoHomeKinEvents.map((event) => (
                  <Pressable
                    accessibilityHint="Opens Kin"
                    accessibilityRole="button"
                    key={event.id}
                    onPress={() => router.push('/home/kin' as Href)}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  >
                    <Text style={styles.rowLabel}>{event.name}</Text>
                    <Text numberOfLines={1} style={styles.rowValueMuted}>{event.event}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {demoEnabled && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PROGRESS</Text>
              <Pressable
                accessibilityHint="Opens the progress preview"
                accessibilityRole="button"
                onPress={() => router.push('/home/progress' as Href)}
                style={({ pressed }) => [styles.rowGroup, styles.singleRow, pressed && styles.rowPressed]}
              >
                <Text style={styles.rowLabel}>{demoMonthProgress.label}</Text>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>{demoMonthProgress.value}</Text>
                  <Feather color={theme.colors.warmGrey} name="chevron-right" size={16} />
                </View>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.createSection}>
          <PrimaryButtonV2
            accessibilityHint={pendingCommitment ? 'Opens your unfinished commitment' : 'Starts setting up a new challenge'}
            label={pendingCommitment ? 'Continue setup' : '+ Create challenge'}
            onPress={createChallenge}
            reducedMotion={reducedMotion}
          />
          {pendingCommitment && (
            <Pressable accessibilityHint="Cancels your unfinished commitment and starts a new one" accessibilityRole="button" onPress={openStartOverSheet} style={styles.startOverLink}>
              <Text style={styles.startOverText}>Start over instead</Text>
            </Pressable>
          )}
        </View>
      </View>

      <BottomSheetV2 onClose={() => setCheckInOpen(false)} reducedMotion={reducedMotion} visible={checkInOpen}>
        {demoEnabled ? (
          <DemoCheckInSheetV2 onClose={() => setCheckInOpen(false)} />
        ) : real.status === 'ready' && focusPeriod ? (
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
  header: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  demoPill: {
    borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  demoPillActive: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep },
  demoPillText: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  demoPillTextActive: { color: theme.colors.ivory },
  greeting: { marginTop: theme.spacing.small, color: theme.colors.ivory, fontSize: 22, fontWeight: '600' },
  section: { marginTop: theme.spacing.small },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  todayCard: {
    marginTop: 8, borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.oxblood,
    backgroundColor: theme.colors.surfaceRaised, padding: theme.spacing.medium, gap: 6,
  },
  challengeName: { color: theme.colors.ivory, fontSize: 21, fontWeight: '700' },
  progressLine: { color: theme.colors.crimsonBright, fontSize: 14, fontWeight: '700' },
  checkInButton: { marginTop: 6 },
  shareAgainLink: { marginTop: 4, minHeight: 32, justifyContent: 'center' },
  shareAgainText: { color: theme.colors.ivoryMuted, fontSize: 12, fontWeight: '600' },
  emptySection: { marginTop: theme.spacing.large, gap: theme.spacing.xsmall },
  emptyTitle: { color: theme.colors.ivory, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: theme.colors.ivoryMuted, fontSize: 13 },
  rowGroup: {
    marginTop: 8, borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  row: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine,
  },
  singleRow: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  rowPressed: { backgroundColor: theme.colors.surfaceFocused },
  rowLabel: { color: theme.colors.ivory, fontSize: 14, fontWeight: '600', flexShrink: 1, marginRight: 8 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '600' },
  rowValueMuted: { color: theme.colors.ivoryMuted, fontSize: 13, flexShrink: 1, textAlign: 'right' },
  createSection: { gap: 10 },
  startOverLink: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
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
