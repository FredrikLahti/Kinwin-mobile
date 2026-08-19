import { Feather } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarV2 } from '@/components/v2/avatar';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { describeChallengeHistory } from '@/lib/home/me-summary';
import { playSelectionHaptic } from '@/lib/haptics';
import { fetchChallengeHistorySummary } from '@/lib/supabase/playbook-repository';

export default function MeV2() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [summary, setSummary] = useState<{ completed: number; failed: number } | null>(null);
  const name = profile?.displayName?.trim() || user?.email?.split('@')[0] || 'You';

  useFocusEffect(useCallback(() => {
    if (!user) return;
    void fetchChallengeHistorySummary(user.id).then((result) => { if (result.ok) setSummary(result.value); });
  }, [user]));

  const go = (href: Href) => {
    void playSelectionHaptic();
    router.push(href);
  };

  const history = summary ? describeChallengeHistory(summary) : null;

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.wordmark}>KINWIN</Text>

        <View style={styles.identity}>
          <AvatarV2 size={58} />
          <View style={styles.identityCopy}>
            <Text style={styles.name}>{name}</Text>
            {user?.email && <Text style={styles.email}>{user.email}</Text>}
          </View>
        </View>

        {history && <Text style={styles.history}>{history}</Text>}

        <Text style={styles.sectionLabel}>PERSONAL PLAYBOOK</Text>
        <Pressable
          accessibilityHint="Opens your Personal Playbook"
          accessibilityRole="button"
          onPress={() => go('/playbook' as Href)}
          style={({ pressed }) => [styles.playbook, pressed && styles.pressed]}
        >
          <View style={styles.playbookIcon}>
            <Feather color={theme.colors.ivory} name="book-open" size={21} />
          </View>
          <View style={styles.playbookCopy}>
            <Text style={styles.playbookTitle}>What works for you</Text>
            <Text style={styles.playbookBody}>Keep useful lessons ready for your next challenge.</Text>
          </View>
          <Feather color={theme.colors.warmGrey} name="chevron-right" size={18} />
        </Pressable>

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <Pressable
          accessibilityHint="Opens account details and settings"
          accessibilityRole="button"
          onPress={() => go('/account' as Href)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Feather color={theme.colors.ivoryMuted} name="user" size={18} />
          <Text style={styles.rowText}>Account and settings</Text>
          <Feather color={theme.colors.warmGrey} name="chevron-right" size={17} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: 22, paddingVertical: 22, gap: 17,
  },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6, marginBottom: 2 },
  identityCopy: { gap: 3 },
  name: { color: theme.colors.ivory, fontSize: 27, fontWeight: '700' },
  email: { color: theme.colors.ivoryMuted, fontSize: 13 },
  history: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20, paddingBottom: 10 },
  sectionLabel: { color: theme.colors.rosewood, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 8 },
  playbook: {
    minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16,
    borderRadius: theme.radius.controlled, backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong,
  },
  playbookIcon: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.oxblood,
  },
  playbookCopy: { flex: 1, gap: 4 },
  playbookTitle: { color: theme.colors.ivory, fontSize: 17, fontWeight: '800' },
  playbookBody: { color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  row: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 15, borderRadius: theme.radius.controlled, backgroundColor: theme.colors.surface,
  },
  rowText: { flex: 1, color: theme.colors.ivory, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});
