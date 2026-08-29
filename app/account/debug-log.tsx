import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { clearCrashLog, CrashLogEntry, readCrashLog } from '@/lib/debug/crash-log';
import { crashLogStorage } from '@/lib/debug/crash-log-storage';

/**
 * A plain, unstyled-on-purpose readout of lib/debug/crash-log.ts's stored
 * entries — the one place "what crashed and why" is answerable after the
 * fact without a live debugging session. Not linked from primary
 * navigation; reachable from Account's "Debug info" row.
 */
export default function DebugLogScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<readonly CrashLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    void readCrashLog(crashLogStorage).then((result) => {
      setEntries(result);
      setLoaded(true);
    });
  }, []);

  useFocusEffect(load);

  const clear = () => {
    void clearCrashLog(crashLogStorage).then(load);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Returns to Account"
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            >
              <Text aria-hidden style={styles.backIcon}>‹</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>Debug info</Text>
          </View>

          <Text style={styles.helper}>
            The last few crashes this device recorded, stored only on this device. Useful for reporting a bug, not sent anywhere automatically.
          </Text>

          {loaded && entries.length === 0 && <Text style={styles.empty}>No crashes recorded.</Text>}

          {entries.map((entry, index) => (
            <View key={`${entry.timestamp}-${index}`} style={styles.entry}>
              <Text style={styles.entryTimestamp}>{entry.timestamp}</Text>
              <Text style={styles.entryMessage}>{entry.message}</Text>
              {entry.componentStack && <Text style={styles.entryStack}>{entry.componentStack.trim()}</Text>}
              {entry.stack && <Text style={styles.entryStack}>{entry.stack}</Text>}
            </View>
          ))}

          {entries.length > 0 && (
            <Pressable
              accessibilityHint="Permanently removes the stored crash log from this device"
              accessibilityRole="button"
              onPress={clear}
              style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
            >
              <Text style={styles.clearButtonLabel}>Clear log</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 6, paddingBottom: theme.spacing.large, gap: 14,
  },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  title: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  helper: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 17 },
  empty: { color: theme.colors.ivoryMuted, fontSize: 14 },
  entry: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, padding: theme.spacing.medium, gap: 6,
  },
  entryTimestamp: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '700' },
  entryMessage: { color: theme.colors.ivory, fontSize: 14, fontWeight: '700' },
  entryStack: { color: theme.colors.ivoryMuted, fontSize: 11, lineHeight: 15 },
  clearButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearButtonPressed: { opacity: 0.7 },
  clearButtonLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
});
