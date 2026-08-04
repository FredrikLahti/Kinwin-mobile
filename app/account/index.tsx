import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { kinwinTheme as theme } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { fetchLatestEditableDraft } from '@/lib/supabase/challenge-draft-repository';

type DraftLookup = { status: 'loading' } | { status: 'none' } | { status: 'found' } | { status: 'error'; message: string };

export default function AccountScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { profile, signOut, updateDisplayName, user } = useAuth();
  const onboarding = useOnboarding();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [draftLookup, setDraftLookup] = useState<DraftLookup>({ status: 'loading' });

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '');
  }, [profile?.displayName]);

  const loadDraftLookup = useCallback(async () => {
    if (!user) return;
    setDraftLookup({ status: 'loading' });
    const result = await fetchLatestEditableDraft(user.id);
    if (!result.ok) {
      setDraftLookup({ status: 'error', message: 'Could not check for a saved draft. Check your connection.' });
      return;
    }
    setDraftLookup(result.draftId ? { status: 'found' } : { status: 'none' });
  }, [user]);

  useEffect(() => {
    void loadDraftLookup();
  }, [loadDraftLookup]);

  const saveName = async () => {
    void playSelectionHaptic();
    setSavingName(true);
    setNameSaved(false);
    const result = await updateDisplayName(displayName);
    setSavingName(false);
    if (result.ok) setNameSaved(true);
  };

  const continueDraft = async () => {
    if (!user) return;
    void playImportantHaptic();
    const result = await fetchLatestEditableDraft(user.id);
    if (result.ok && result.draftId && result.data) {
      onboarding.loadDraftData(result.data, result.draftId);
      router.push('/consequence/review' as Href);
    }
  };

  const startNew = () => {
    void playImportantHaptic();
    onboarding.resetDraft();
    router.push('/onboarding/goal' as Href);
  };

  const handleSignOut = async () => {
    void playSelectionHaptic();
    await signOut();
    router.replace('/' as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Returns to the Kinwin welcome screen"
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            >
              <Text aria-hidden style={styles.backIcon}>‹</Text>
            </Pressable>
            <Text style={styles.wordmark}>KINWIN</Text>
          </View>

          <View style={styles.intro}>
            <Text style={styles.phaseLabel}>YOUR ACCOUNT</Text>
            <Text accessibilityRole="header" style={styles.headline}>{user?.email}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>DISPLAY NAME (OPTIONAL)</Text>
            <TextInput
              accessibilityLabel="Display name"
              onChangeText={(value) => { setDisplayName(value); setNameSaved(false); }}
              placeholder="What should we call you?"
              placeholderTextColor={theme.colors.warmGrey}
              style={styles.input}
              value={displayName}
            />
            <Pressable
              accessibilityHint="Saves your display name"
              accessibilityRole="button"
              disabled={savingName}
              onPress={() => void saveName()}
              style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
            >
              <Text style={styles.textButtonLabel}>{savingName ? 'Saving…' : nameSaved ? 'Saved' : 'Save name'}</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SAVED PROGRESS</Text>
            {draftLookup.status === 'loading' && <Text style={styles.body}>Checking for a saved draft…</Text>}
            {draftLookup.status === 'error' && <Text style={styles.error}>{draftLookup.message}</Text>}
            {draftLookup.status === 'none' && (
              <Text style={styles.body}>No saved draft yet. Complete setup once to save your promise here.</Text>
            )}
            {draftLookup.status === 'found' && (
              <>
                <Text style={styles.body}>You have a saved draft from a previous session.</Text>
                <AnimatedPrimaryButton
                  accessibilityHint="Restores your saved draft into onboarding for review"
                  label="Continue saved draft"
                  onPress={() => void continueDraft()}
                  reducedMotion={reducedMotion}
                />
              </>
            )}
            <Pressable
              accessibilityHint="Starts a new onboarding draft"
              accessibilityRole="button"
              onPress={startNew}
              style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
            >
              <Text style={styles.textButtonLabel}>Start a new draft instead</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PENDING COMMITMENT</Text>
            <Text style={styles.body}>
              If a completed draft has been saved on the server as a pending commitment, view its
              status, continue setup, or cancel it there.
            </Text>
            <Pressable
              accessibilityHint="Opens your pending commitment, if any"
              accessibilityRole="button"
              onPress={() => { void playSelectionHaptic(); router.push('/account/pending-commitment' as Href); }}
              style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
            >
              <Text style={styles.textButtonLabel}>View pending commitment</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityHint="Signs out of your Kinwin account"
            accessibilityRole="button"
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutButtonPressed]}
          >
            <Text style={styles.signOutLabel}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: 26, paddingTop: 6, paddingBottom: 24, gap: 24,
  },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, marginRight: 4, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  intro: { gap: 8 },
  phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 26, fontWeight: '400', lineHeight: 32,
  },
  field: { gap: 8 },
  label: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  input: {
    minHeight: 50, borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: theme.radius.controlled, backgroundColor: theme.colors.surface,
    paddingHorizontal: 14, color: theme.colors.bone, fontSize: 15,
  },
  section: { gap: 10, borderTopWidth: 1, borderTopColor: theme.colors.structureLine, paddingTop: 20 },
  sectionLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  body: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  error: { color: '#E37D6A', fontSize: 13, lineHeight: 19 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
  signOutButton: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
  },
  signOutButtonPressed: { backgroundColor: theme.colors.surface },
  signOutLabel: { color: theme.colors.boneMuted, fontSize: 14, fontWeight: '700' },
});
