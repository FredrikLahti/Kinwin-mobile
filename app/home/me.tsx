import { Feather } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarV2 } from '@/components/v2/avatar';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useUXV2Preview } from '@/contexts/ux-v2-preview-context';
import { demoMeStats } from '@/fixtures/ux-v2-preview';
import { useActiveChallengeView } from '@/hooks/use-active-challenge-view';
import { playSelectionHaptic } from '@/lib/haptics';

const PRIMARY_DESTINATIONS = [
  { icon: 'clock' as const, label: 'History', href: '/home/coming-soon?title=History' as Href },
  { icon: 'book-open' as const, label: 'Personal Playbook', href: '/challenge/playbook' as Href },
  { icon: 'bar-chart-2' as const, label: 'Progress', href: '/home/progress' as Href },
];

const SECONDARY_DESTINATIONS = [
  { icon: 'user' as const, label: 'Account', href: '/account' as Href },
  { icon: 'credit-card' as const, label: 'Membership', href: '/home/coming-soon?title=Membership' as Href },
  { icon: 'settings' as const, label: 'Settings', href: '/home/coming-soon?title=Settings' as Href },
];

export default function MeV2() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const { demoEnabled } = useUXV2Preview();
  const { view } = useActiveChallengeView();

  const name = profile?.displayName?.trim() || user?.email?.split('@')[0] || 'You';
  const stats = demoEnabled
    ? demoMeStats
    : { completed: 0, active: view !== null ? 1 : 0, failed: 0 };

  const go = (href: Href) => {
    void playSelectionHaptic();
    router.push(href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.identity}>
          <AvatarV2 size={56} />
          <Text style={styles.name}>{name}</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat label="completed" value={stats.completed} />
          <Stat label="active" value={stats.active} />
          <Stat label="failed" value={stats.failed} />
        </View>

        <View style={styles.section}>
          {PRIMARY_DESTINATIONS.map((item) => (
            <DestinationRow key={item.label} icon={item.icon} label={item.label} onPress={() => go(item.href)} />
          ))}
        </View>

        <View style={styles.section}>
          {SECONDARY_DESTINATIONS.map((item) => (
            <DestinationRow key={item.label} icon={item.icon} label={item.label} muted onPress={() => go(item.href)} />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DestinationRow({
  icon,
  label,
  muted = false,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={`Opens ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Feather color={muted ? theme.colors.warmGrey : theme.colors.crimsonBright} name={icon} size={18} />
      <Text style={[styles.rowLabel, muted && styles.rowLabelMuted]}>{label}</Text>
      <Feather color={theme.colors.warmGrey} name="chevron-right" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingVertical: theme.spacing.medium, gap: theme.spacing.medium,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row', borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, paddingVertical: theme.spacing.small,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: theme.colors.ivory, fontSize: 22, fontWeight: '700' },
  statLabel: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '600' },
  section: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  row: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine,
  },
  rowPressed: { backgroundColor: theme.colors.surfaceFocused },
  rowLabel: { flex: 1, color: theme.colors.ivory, fontSize: 15, fontWeight: '600' },
  rowLabelMuted: { color: theme.colors.ivoryMuted },
});
