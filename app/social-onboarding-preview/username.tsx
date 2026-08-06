import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { UsernameCheckOutcome } from '@/domain/social/onboarding';
import { TAKEN_USERNAMES } from '@/fixtures/social/onboarding-directory';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { checkUsername } from '@/lib/social/username';

const NEXT_ROUTES: Record<string, string> = {
  'add-kin': '/social-onboarding-preview/add-kin',
  invite: '/social-onboarding-preview/invite',
};

/**
 * Journey 2 — optional social identity. Only reached when the user first
 * attempts to add or invite Kin (never forced during ordinary account
 * creation or solo use). Demonstrates every deterministic state: empty,
 * invalid format, available, unavailable, saving, saved.
 */
export default function UsernameScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ next?: string }>();
  const { beginSavingUsername, state } = useSocialOnboarding();
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<UsernameCheckOutcome | null>(null);

  const nextPath = params.next ? NEXT_ROUTES[params.next] : undefined;

  useEffect(() => {
    if (state.identity.status !== 'saved') return;
    // Auto-advance once saved, back to whatever the user was trying to do.
    const timer = setTimeout(() => {
      router.replace((nextPath ?? '/social-onboarding-preview/cold-start') as Href);
    }, 900);
    return () => clearTimeout(timer);
  }, [nextPath, router, state.identity.status]);

  const check = () => {
    void playSelectionHaptic();
    setOutcome(checkUsername(query, TAKEN_USERNAMES));
  };

  const save = () => {
    if (outcome?.kind !== 'available') return;
    void playImportantHaptic();
    beginSavingUsername(outcome.username);
  };

  if (state.identity.status === 'saved') {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.savedWrap}>
          <PrototypeTag />
          <Text accessibilityRole="header" style={styles.savedTitle}>You&apos;re @{state.identity.username}</Text>
          <Text style={styles.savedBody}>Taking you back to continue where you left off…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Closes without choosing a username"
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          >
            <Text aria-hidden style={styles.closeIcon}>✕</Text>
          </Pressable>
          <PrototypeTag />
        </View>

        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>Choose a Kinwin username</Text>
          <Text style={styles.subtitle}>
            People you already know can find you by this exact username — it&apos;s not a public
            profile or a discovery handle, and no one can browse or search for it by guessing.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            accessibilityHint="Try alex_r for taken, sam_k for available"
            accessibilityLabel="Kinwin username"
            autoCapitalize="none"
            autoCorrect={false}
            editable={state.identity.status !== 'saving'}
            onChangeText={(value) => { setQuery(value); setOutcome(null); }}
            onSubmitEditing={check}
            placeholder="e.g. sam_k"
            placeholderTextColor={theme.colors.warmGrey}
            returnKeyType="search"
            style={styles.input}
            value={query}
          />
          <AnimatedPrimaryButton
            accessibilityHint="Checks whether this username is available"
            disabled={query.trim().length === 0 || state.identity.status === 'saving'}
            label="Check availability"
            onPress={check}
            reducedMotion={reducedMotion}
          />
        </View>

        {outcome?.kind === 'invalid_format' && (
          <Message tone="warning" text={outcome.reason} />
        )}
        {outcome?.kind === 'unavailable' && (
          <Message tone="warning" text={`@${outcome.username} is already taken. Try another username.`} />
        )}
        {outcome?.kind === 'available' && state.identity.status !== 'saving' && (
          <View style={styles.availableCard}>
            <Text style={styles.availableText}>@{outcome.username} is available.</Text>
            <Pressable
              accessibilityHint="Saves this as your Kinwin username"
              accessibilityRole="button"
              onPress={save}
              style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
            >
              <Text style={styles.saveButtonText}>Save @{outcome.username}</Text>
            </Pressable>
          </View>
        )}
        {state.identity.status === 'saving' && (
          <View style={styles.savingCard}>
            <ActivityIndicator color={theme.colors.copperBright} />
            <Text style={styles.savingText}>Saving your username…</Text>
          </View>
        )}

        <View style={styles.explainerCard}>
          <Text style={styles.explainerLabel}>DISPLAY NAME VS. USERNAME</Text>
          <Text style={styles.explainerBody}>
            Your display name is what shows on cards and in Challenge Rooms — it can be anything.
            Your username is only for exact lookup in Add Kin, and only people who already know it
            can use it to find you.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Message({ text, tone }: { text: string; tone: 'warning' }) {
  return (
    <View style={[styles.messageCard, tone === 'warning' && styles.messageCardWarning]}>
      <Text style={styles.messageText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  header: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 6,
  },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.precise },
  closeButtonPressed: { backgroundColor: theme.colors.surface },
  closeIcon: { color: theme.colors.boneMuted, fontSize: 16, fontWeight: '700' },
  intro: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 8, paddingHorizontal: 22, paddingTop: 18,
  },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 24, lineHeight: 30,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  field: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, paddingHorizontal: 22, paddingTop: 24,
  },
  label: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  input: {
    minHeight: 50,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, color: theme.colors.bone, fontSize: 15,
  },
  messageCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    marginHorizontal: 22, marginTop: 16,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 14,
  },
  messageCardWarning: { borderColor: '#E37D6A' },
  messageText: { color: theme.colors.bone, fontSize: 13, lineHeight: 19 },
  availableCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 12, marginHorizontal: 22, marginTop: 16,
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.copperSurface, padding: 14,
  },
  availableText: { color: theme.colors.bone, fontSize: 13.5, fontWeight: '700' },
  saveButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.copperDeep,
  },
  saveButtonPressed: { opacity: 0.85 },
  saveButtonText: { color: theme.colors.copperBright, fontSize: 13.5, fontWeight: '700' },
  savingCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 22, marginTop: 16,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 14,
  },
  savingText: { color: theme.colors.boneMuted, fontSize: 13 },
  explainerCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 6, marginHorizontal: 22, marginTop: 28,
    borderTopWidth: 1, borderColor: theme.colors.structureLine, paddingTop: 18,
  },
  explainerLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  explainerBody: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  savedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  savedTitle: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 24,
  },
  savedBody: { color: theme.colors.boneMuted, fontSize: 13 },
});
