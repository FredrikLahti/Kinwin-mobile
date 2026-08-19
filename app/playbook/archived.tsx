import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { PLAYBOOK_CATEGORY_LABELS } from '@/lib/playbook/category-copy';
import {
  deletePlaybookEntry,
  fetchArchivedPlaybookEntries,
  PlaybookEntry,
  unarchivePlaybookEntry,
} from '@/lib/supabase/playbook-repository';

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly entries: readonly PlaybookEntry[] };

export default function ArchivedPlaybookScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const result = await fetchArchivedPlaybookEntries();
    setState(result.ok ? { kind: 'ready', entries: result.value } : { kind: 'error', message: result.message });
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const restore = (id: string) => {
    Alert.alert('Restore this entry?', 'It will return to your active Playbook.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', onPress: async () => { const result = await unarchivePlaybookEntry(id); if (result.ok) void load(); } },
    ]);
  };

  const remove = (id: string) => {
    Alert.alert('Delete this entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { const result = await deletePlaybookEntry(id); if (result.ok) void load(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.iconButton}>
            <Feather color={theme.colors.ivory} name="chevron-left" size={24} />
          </Pressable>
          <Text style={styles.wordmark}>KINWIN</Text>
        </View>
        <Text style={styles.eyebrow}>PERSONAL PLAYBOOK</Text>
        <Text accessibilityRole="header" style={styles.title}>Archived entries.</Text>

        {state.kind === 'loading' && <ActivityIndicator color={theme.colors.rosewood} />}
        {state.kind === 'error' && (
          <View style={styles.message}>
            <Text style={styles.error}>{state.message}</Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void load()}>
              <Text style={styles.link}>Try again</Text>
            </Pressable>
          </View>
        )}
        {state.kind === 'ready' && state.entries.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No archived entries.</Text>
            <Text style={styles.muted}>Entries you archive from your Playbook will show up here.</Text>
          </View>
        )}
        {state.kind === 'ready' && state.entries.map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <Text style={styles.category}>{PLAYBOOK_CATEGORY_LABELS[entry.category].toUpperCase()}</Text>
            <Text style={styles.entryText}>{entry.content}</Text>
            <View style={styles.entryActions}>
              <Pressable accessibilityHint="Returns this entry to your active Playbook" accessibilityRole="button" hitSlop={6} onPress={() => restore(entry.id)} style={styles.actionButton}>
                <Text style={styles.restoreText}>Restore</Text>
              </Pressable>
              <Pressable accessibilityHint="Permanently deletes this entry" accessibilityRole="button" hitSlop={6} onPress={() => remove(entry.id)} style={styles.actionButton}>
                <Text style={styles.deleteText}>Delete permanently</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.ink },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 40, gap: 16 },
  header: { height: 54, flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  wordmark: { color: theme.colors.ivory, fontSize: 12, fontWeight: '800', letterSpacing: 4 },
  eyebrow: { color: theme.colors.rosewood, fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  title: { color: theme.colors.ivory, fontFamily: 'Georgia', fontSize: 31, lineHeight: 37 },
  message: { gap: 10, paddingVertical: 20 },
  error: { color: theme.colors.crimsonBright, lineHeight: 21 },
  link: { color: theme.colors.rosewood, fontWeight: '800' },
  empty: { paddingVertical: 28, gap: 8, borderTopWidth: 1, borderTopColor: theme.colors.structureLine },
  emptyTitle: { color: theme.colors.ivory, fontSize: 19, fontWeight: '700' },
  muted: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21 },
  entry: { gap: 10, paddingVertical: 17, borderTopWidth: 1, borderTopColor: theme.colors.structureLine },
  category: { color: theme.colors.rosewood, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  entryText: { color: theme.colors.ivory, fontSize: 16, lineHeight: 23 },
  entryActions: { flexDirection: 'row', gap: 18 },
  actionButton: { minHeight: 32, justifyContent: 'center' },
  restoreText: { color: theme.colors.ivoryMuted, fontWeight: '700' },
  deleteText: { color: theme.colors.crimsonBright, fontWeight: '700' },
});
