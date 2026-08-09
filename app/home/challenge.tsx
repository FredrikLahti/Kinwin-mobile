import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useRealActiveChallenge } from '@/hooks/use-real-active-challenge';
import { formatClockTime } from '@/lib/challenge-ux-preview/view-model';
import { describeChallengeIdentity, describeConsequence } from '@/lib/home/challenge-summary';
import { playSelectionHaptic } from '@/lib/haptics';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ActiveChallengeDetailScreen() {
  const router = useRouter();
  const { state: real } = useRealActiveChallenge();

  const goBack = () => {
    void playSelectionHaptic();
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  if (real.status !== 'ready') {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Pressable accessibilityHint="Returns to Home" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
            <Text aria-hidden style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.wordmark}>KINWIN</Text>
        </View>
        <View style={styles.emptyBody}>
          <Text style={styles.emptyText}>{real.status === 'error' ? 'Could not load this challenge.' : 'No active challenge to show.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { challenge, periods } = real.data;
  const identity = describeChallengeIdentity(challenge);
  const consequence = describeConsequence(challenge);
  const focusPeriod = periods.find((period) => period.id === real.view.focusPeriodId) ?? null;
  const recipientNames = challenge.recipients.map((r) => r.name.trim()).filter(Boolean);

  const shareInvite = async () => {
    void playSelectionHaptic();
    const message =
      `Hi! I am keeping a Kinwin challenge: ${identity.headline}.\n\n` +
      `If I don't keep it, ${recipientNames.join(', ') || 'them'} could receive a reward funded by my stake. I will not take part.`;
    await Share.share({ message });
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable accessibilityHint="Returns to Home" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Text aria-hidden style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.wordmark}>KINWIN</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>GOAL</Text>
          <Text style={styles.goal}>{challenge.goal}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>THE CHALLENGE</Text>
          <Text style={styles.identityHeadline}>{identity.headline}</Text>
          {identity.ruleDetail && <Text style={styles.identityRule}>{identity.ruleDetail}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DURATION</Text>
          <Text style={styles.body}>{challenge.duration.value} weeks</Text>
          <Text style={styles.bodyMuted}>{formatDate(challenge.startsAt)} to {formatDate(challenge.plannedEndsAt)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PROGRESS</Text>
          <Text style={styles.body}>
            {real.view.progress.periodsClosed} of {real.view.progress.periodsTotal} periods closed
            {real.view.progress.periodsClosed > 0 ? `, ${real.view.progress.periodsMet} met` : ''}
          </Text>
          <Text style={styles.bodyMuted}>{real.view.progress.requirementLabel}</Text>
          {real.view.progress.streakLabel && <Text style={styles.bodyMuted}>{real.view.progress.streakLabel}</Text>}
        </View>

        {focusPeriod && real.view.finalResult === null && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>REPORTING</Text>
            <Text style={styles.bodyMuted}>You can report until {formatClockTime(focusPeriod.reportingClosesAt)} after this period ends.</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECIPIENTS</Text>
          <Text style={styles.body}>{recipientNames.join(', ') || 'None set'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>IF MISSED</Text>
          <Text style={styles.body}>{consequence.recipientsCompact} · {consequence.categoryLabel} · {consequence.stakeLabel}</Text>
          <Text style={styles.bodyMuted}>The stake funds their experience. You will not take part.</Text>
        </View>

        <Pressable accessibilityHint="Opens your phone's share sheet with your invitation again" accessibilityRole="button" hitSlop={6} onPress={() => void shareInvite()} style={styles.shareAction}>
          <Text style={styles.shareActionText}>Share invite again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  header: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: theme.spacing.medium,
  },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  wordmark: { color: theme.colors.ivory, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  content: {
    width: '100%', maxWidth: 560, alignSelf: 'center', flex: 1,
    paddingHorizontal: theme.spacing.medium, paddingTop: 18, paddingBottom: theme.spacing.large, gap: 22,
  },
  section: { gap: 4 },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  goal: { color: theme.colors.ivory, fontSize: 20, fontWeight: '600' },
  identityHeadline: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  identityRule: { color: theme.colors.ivoryMuted, fontSize: 15, fontWeight: '600' },
  body: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600' },
  bodyMuted: { color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 18 },
  shareAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  shareActionText: { color: theme.colors.ivory, fontSize: 14, fontWeight: '700' },
  emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.medium },
  emptyText: { color: theme.colors.ivoryMuted, fontSize: 15, textAlign: 'center' },
});
