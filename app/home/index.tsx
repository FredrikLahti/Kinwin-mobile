import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { CheckInSheetV2 } from '@/components/v2/check-in-sheet';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { ProgressDotsV2 } from '@/components/v2/progress-dots';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useActiveChallengeView } from '@/hooks/use-active-challenge-view';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { fetchPendingCommitment } from '@/lib/supabase/challenge-repository';

function greetingWord() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function periodPhrase(periodUnit: 'day' | 'week' | 'challenge') {
  return periodUnit === 'day' ? 'today' : periodUnit === 'week' ? 'this week' : 'this challenge';
}

export default function HomeV2() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { profile, user } = useAuth();
  const { onboarding, preview, configuration, view } = useActiveChallengeView();
  const [checkInOpen, setCheckInOpen] = useState(false);

  const firstName = profile?.displayName?.trim() || user?.email?.split('@')[0] || 'there';
  const hasChallenge = view !== null && configuration !== null;

  const createChallenge = async () => {
    if (user) {
      const result = await fetchPendingCommitment(user.id);
      if (result.ok && result.commitment) {
        router.push('/account/pending-commitment' as Href);
        return;
      }
    }
    onboarding.resetDraft();
    router.push('/onboarding/goal' as Href);
  };

  const progressLine = () => {
    if (!configuration) return '';
    if (configuration.direction === 'build') {
      return `${preview.buildCompletions} of ${configuration.target} ${periodPhrase(configuration.periodUnit)}`;
    }
    if (configuration.direction === 'cut') {
      const total = preview.cutTotal ?? 0;
      return `${total} of ${configuration.target} ${configuration.unit} ${periodPhrase(configuration.periodUnit)}`;
    }
    return preview.stopStatus === 'lapse' ? 'Lapse recorded' : preview.stopStatus === 'intact' ? 'Promise intact' : 'No check-in yet';
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

          {hasChallenge && configuration && view ? (
            <View style={styles.todaySection}>
              <Text style={styles.sectionLabel}>TODAY</Text>
              <View style={styles.card}>
                <Text numberOfLines={2} style={styles.challengeName}>{onboarding.behaviorText.trim()}</Text>
                <Text style={styles.progressLine}>{progressLine()}</Text>
                {configuration.direction === 'build' && (
                  <ProgressDotsV2 filled={preview.buildCompletions} total={configuration.target} />
                )}
                <View style={styles.checkInButton}>
                  <PrimaryButtonV2
                    accessibilityHint="Opens check-in for this challenge"
                    label="Check in"
                    onPress={() => setCheckInOpen(true)}
                    reducedMotion={reducedMotion}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptyTitle}>No active challenge yet.</Text>
              <Text style={styles.emptyBody}>Create one to see it here.</Text>
            </View>
          )}
        </View>

        <Pressable
          accessibilityHint="Starts setting up a new challenge"
          accessibilityRole="button"
          onPress={() => void createChallenge()}
          style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
        >
          <Text style={styles.createButtonLabel}>+ Create challenge</Text>
        </Pressable>
      </View>

      <BottomSheetV2 onClose={() => setCheckInOpen(false)} reducedMotion={reducedMotion} visible={checkInOpen}>
        <CheckInSheetV2 onClose={() => setCheckInOpen(false)} />
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
    paddingVertical: theme.spacing.medium,
  },
  header: { minHeight: 36, justifyContent: 'center' },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  greeting: {
    marginTop: theme.spacing.large,
    color: theme.colors.ivory,
    fontSize: 26,
    fontWeight: '600',
  },
  sectionLabel: {
    marginTop: theme.spacing.large,
    color: theme.colors.warmGrey,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  todaySection: { gap: theme.spacing.small },
  card: {
    marginTop: theme.spacing.small,
    borderRadius: theme.radius.controlled,
    borderWidth: 1,
    borderColor: theme.colors.oxblood,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.large,
    gap: theme.spacing.small,
  },
  challengeName: {
    color: theme.colors.ivory,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  progressLine: {
    color: theme.colors.crimsonBright,
    fontSize: 15,
    fontWeight: '700',
  },
  checkInButton: { marginTop: theme.spacing.small },
  emptySection: {
    marginTop: theme.spacing.xlarge,
    gap: theme.spacing.xsmall,
  },
  emptyTitle: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  emptyBody: { color: theme.colors.ivoryMuted, fontSize: 14 },
  createButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.controlled,
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surface,
  },
  createButtonPressed: { backgroundColor: theme.colors.surfaceRaised },
  createButtonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
});
