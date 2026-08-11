import { Feather } from '@expo/vector-icons';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { buildPlaybookCreateInput } from '@/lib/playbook/create-entry';
import { archivePlaybookEntry, createPlaybookEntry, deletePlaybookEntry, fetchPlaybookEntry, PLAYBOOK_CATEGORIES, PlaybookCategory, updatePlaybookEntry } from '@/lib/supabase/playbook-repository';

const LABELS: Record<PlaybookCategory, string> = { trigger: 'Trigger', obstacle: 'Obstacle', replacement: 'Replacement', environment: 'Environment', support: 'Support', lesson: 'General lesson' };
function oneParam(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }

export default function EditPlaybookEntry() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; sourceChallengeId?: string | string[]; returnTo?: string | string[] }>();
  const id = oneParam(params.id);
  const sourceChallengeId = id ? '' : oneParam(params.sourceChallengeId);
  const requestedReturn = oneParam(params.returnTo);
  const safeReturn = sourceChallengeId && requestedReturn === `/home/result?id=${sourceChallengeId}` ? requestedReturn : '';
  const { user } = useAuth();
  const [category, setCategory] = useState<PlaybookCategory>('lesson');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const result = await fetchPlaybookEntry(id);
      if (result.ok && result.value) { setCategory(result.value.category); setContent(result.value.content); }
      else setError(result.ok ? 'This entry is no longer available.' : result.message);
      setLoading(false);
    })();
  }, [id]);

  const save = async () => {
    if (!user || !content.trim() || saving) return;
    Keyboard.dismiss(); setSaving(true); setError(null);
    const result = id
      ? await updatePlaybookEntry(id, { category, content })
      : await createPlaybookEntry(buildPlaybookCreateInput({ ownerId: user.id, category, content, sourceChallengeId }));
    setSaving(false);
    if (result.ok) router.replace((safeReturn ? `${safeReturn}&saved=1` : '/playbook') as Href);
    else setError(result.message);
  };
  const archive = () => id && Alert.alert('Archive this entry?', 'It will leave your Playbook without being permanently deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive', style: 'destructive', onPress: async () => { const result = await archivePlaybookEntry(id); if (result.ok) router.replace('/playbook' as Href); else setError(result.message); } }]);
  const remove = () => id && Alert.alert('Delete this entry?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { const result = await deletePlaybookEntry(id); if (result.ok) router.replace('/playbook' as Href); else setError(result.message); } }]);

  return <SafeAreaView style={styles.safe}><StatusBar style="light" /><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()} style={styles.iconButton}><Feather color={theme.colors.ivory} name="chevron-left" size={24} /></Pressable><Text style={styles.wordmark}>KINWIN</Text></View>
    <Text style={styles.eyebrow}>{id ? 'EDIT ENTRY' : sourceChallengeId ? 'FROM YOUR CHALLENGE' : 'NEW ENTRY'}</Text>
    <Text accessibilityRole="header" style={styles.title}>{id ? 'Keep what matters useful.' : 'What is worth remembering?'}</Text>
    {sourceChallengeId && <Text style={styles.sourceNote}>This lesson will stay connected to the challenge you just completed.</Text>}
    {loading ? <ActivityIndicator color={theme.colors.rosewood} /> : <>
      <Text style={styles.label}>TYPE</Text><View style={styles.choices}>{PLAYBOOK_CATEGORIES.map((value) => <Pressable key={value} accessibilityLabel={LABELS[value]} accessibilityRole="radio" accessibilityState={{ checked: category === value }} onPress={() => setCategory(value)} style={({ pressed }) => [styles.choice, category === value && styles.choiceSelected, pressed && styles.pressed]}><Text style={[styles.choiceText, category === value && styles.choiceTextSelected]}>{LABELS[value]}</Text></Pressable>)}</View>
      <Text style={styles.label}>WHAT YOU LEARNED</Text><TextInputV2 accessibilityLabel="Playbook entry" keyboardAppearance="dark" maxLength={280} multiline onChangeText={setContent} placeholder="Keep it short and practical" placeholderTextColor={theme.colors.warmGrey} returnKeyType="done" style={styles.input} textAlignVertical="top" value={content} />
      <View style={styles.inputMeta}><Text style={styles.counter}>{content.length}/280</Text><Pressable accessibilityHint="Closes the keyboard" accessibilityRole="button" onPress={() => Keyboard.dismiss()} style={styles.doneButton}><Text style={styles.done}>Done</Text></Pressable></View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable accessibilityHint="Saves this entry to Personal Playbook" accessibilityRole="button" disabled={!content.trim() || saving} onPress={() => void save()} style={({ pressed }) => [styles.primary, (!content.trim() || saving) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save to Playbook'}</Text></Pressable>
      {id && <View style={styles.manage}><Pressable accessibilityRole="button" onPress={archive} style={styles.manageButton}><Text style={styles.secondaryText}>Archive entry</Text></Pressable><Pressable accessibilityRole="button" onPress={remove} style={styles.manageButton}><Text style={styles.deleteText}>Delete permanently</Text></Pressable></View>}
    </>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: theme.colors.ink }, flex: { flex: 1 }, content: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 40, gap: 15 }, header: { height: 54, flexDirection: 'row', alignItems: 'center' }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 }, wordmark: { color: theme.colors.ivory, fontSize: 12, fontWeight: '800', letterSpacing: 4 }, eyebrow: { color: theme.colors.rosewood, fontSize: 10, fontWeight: '800', letterSpacing: 1.7 }, title: { color: theme.colors.ivory, fontFamily: 'Georgia', fontSize: 29, lineHeight: 35, marginBottom: 8 }, sourceNote: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 21, marginTop: -6 }, label: { color: theme.colors.ivoryMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginTop: 5 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: theme.radius.controlled, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.structureLine }, choiceSelected: { backgroundColor: theme.colors.oxbloodDeep, borderColor: theme.colors.rosewood }, choiceText: { color: theme.colors.ivoryMuted, fontSize: 14, fontWeight: '700' }, choiceTextSelected: { color: theme.colors.ivory }, input: { minHeight: 132, borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface, color: theme.colors.ivory, fontSize: 16, lineHeight: 23, padding: 14 }, inputMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, counter: { color: theme.colors.warmGrey, fontSize: 12 }, doneButton: { minHeight: 44, minWidth: 52, alignItems: 'flex-end', justifyContent: 'center' }, done: { color: theme.colors.rosewood, fontWeight: '800' }, primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled, backgroundColor: theme.colors.rosewood, marginTop: 4 }, primaryText: { color: theme.colors.ivory, fontWeight: '800', fontSize: 15 }, disabled: { opacity: 0.4 }, pressed: { opacity: 0.75 }, error: { color: theme.colors.crimsonBright, lineHeight: 20 }, manage: { marginTop: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.colors.structureLine, gap: 4 }, manageButton: { minHeight: 44, justifyContent: 'center' }, secondaryText: { color: theme.colors.ivoryMuted, fontWeight: '700' }, deleteText: { color: theme.colors.crimsonBright, fontWeight: '700' } });
