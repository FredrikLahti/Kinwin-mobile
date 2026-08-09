import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';

// One small, generic, honest destination for secondary Me v2 items that
// don't have a real feature behind them yet (History, Membership,
// Settings, Add Kin, Comments) -- rather than building several bespoke
// placeholder screens for this visual-review package.
export default function ComingSoonV2() {
  const router = useRouter();
  const { title } = useLocalSearchParams<{ title?: string }>();
  const label = title || 'This';

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Pressable
          accessibilityHint="Goes back"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Feather color={theme.colors.crimsonBright} name="chevron-left" size={26} />
        </Pressable>
        <View style={styles.body}>
          <Text style={styles.title}>{label} is on the way.</Text>
          <Text style={styles.copy}>This isn&apos;t built yet.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingVertical: theme.spacing.small,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  backButtonPressed: { opacity: 0.7 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xsmall },
  title: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  copy: { color: theme.colors.ivoryMuted, fontSize: 14 },
});
