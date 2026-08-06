import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { KinAvatar } from '@/components/social/kin-avatar';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { AddKinOutcome } from '@/domain/social/types';
import { ADD_KIN_DIRECTORY } from '@/fixtures/social/kin';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { lookupUsername } from '@/lib/social/add-kin';

export default function AddKinScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<AddKinOutcome | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const search = () => {
    void playSelectionHaptic();
    setSentTo(null);
    setOutcome(lookupUsername(query, ADD_KIN_DIRECTORY));
  };

  const sendRequest = () => {
    if (outcome?.kind !== 'exact_match') return;
    void playImportantHaptic();
    setSentTo(outcome.profile.username);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Closes Add Kin"
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
          <Text accessibilityRole="header" style={styles.title}>Add Kin</Text>
          <Text style={styles.subtitle}>
            Enter someone&apos;s exact Kinwin username. There is no public search, browsing, or
            suggested strangers here — only exact matches.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>USERNAME</Text>
          <View style={styles.inputRow}>
            <TextInput
              accessibilityHint="Try sam_k, mia.rowan, or theo_b to see the different outcomes"
              accessibilityLabel="Exact username"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => { setQuery(value); setOutcome(null); setSentTo(null); }}
              onSubmitEditing={search}
              placeholder="e.g. sam_k"
              placeholderTextColor={theme.colors.warmGrey}
              returnKeyType="search"
              style={styles.input}
              value={query}
            />
          </View>
          <AnimatedPrimaryButton
            accessibilityHint="Looks up this exact username"
            disabled={query.trim().length === 0}
            label="Find Kin"
            onPress={search}
            reducedMotion={reducedMotion}
          />
        </View>

        {outcome && (
          <View style={styles.result}>
            {outcome.kind === 'exact_match' && (
              <ResultCard>
                <ProfileRow initials={outcome.profile.initials} name={outcome.profile.displayName} username={outcome.profile.username} />
                {sentTo === outcome.profile.username ? (
                  <Text style={styles.confirmedText}>Kinship request sent to {outcome.profile.displayName}.</Text>
                ) : (
                  <Pressable
                    accessibilityHint={`Sends a Kinship request to ${outcome.profile.displayName}`}
                    accessibilityRole="button"
                    onPress={sendRequest}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                  >
                    <Text style={styles.actionButtonText}>Send Kinship request</Text>
                  </Pressable>
                )}
              </ResultCard>
            )}

            {outcome.kind === 'already_kin' && (
              <ResultCard>
                <ProfileRow initials={outcome.profile.initials} name={outcome.profile.displayName} username={outcome.profile.username} />
                <Text style={styles.resultText}>You and {outcome.profile.displayName} are already Kin.</Text>
              </ResultCard>
            )}

            {outcome.kind === 'request_pending' && (
              <ResultCard>
                <ProfileRow initials={outcome.profile.initials} name={outcome.profile.displayName} username={outcome.profile.username} />
                <Text style={styles.resultText}>A Kinship request with {outcome.profile.displayName} is already pending.</Text>
              </ResultCard>
            )}

            {outcome.kind === 'no_match' && (
              <ResultCard>
                <Text style={styles.resultText}>
                  No exact match for &quot;{outcome.queriedUsername}&quot;.
                </Text>
                <Text style={styles.resultSubtext}>
                  Kinwin only matches exact usernames — no suggestions, no public search. Ask them
                  for their exact username, or invite them by link.
                </Text>
                <View accessibilityLabel="Invite by link, coming soon, not built in this prototype" style={styles.disabledAction}>
                  <Text style={styles.disabledActionText}>Invite by link (coming soon)</Text>
                </View>
              </ResultCard>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function ProfileRow({ initials, name, username }: { initials: string; name: string; username: string }) {
  return (
    <View style={styles.profileRow}>
      <KinAvatar initials={initials} />
      <View>
        <Text style={styles.profileName}>{name}</Text>
        <Text style={styles.profileUsername}>@{username}</Text>
      </View>
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
    fontSize: 26, lineHeight: 32,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  field: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, paddingHorizontal: 22, paddingTop: 24,
  },
  label: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  inputRow: { flexDirection: 'row' },
  input: {
    flex: 1, minHeight: 50,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, color: theme.colors.bone, fontSize: 15,
  },
  result: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 22 },
  card: {
    gap: 12,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 16,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileName: { color: theme.colors.bone, fontSize: 15, fontWeight: '700' },
  profileUsername: { color: theme.colors.boneMuted, fontSize: 12, marginTop: 2 },
  resultText: { color: theme.colors.bone, fontSize: 13.5, lineHeight: 20 },
  resultSubtext: { color: theme.colors.boneMuted, fontSize: 12.5, lineHeight: 19 },
  confirmedText: { color: theme.colors.copperBright, fontSize: 13.5, fontWeight: '700' },
  actionButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.copperSurface,
  },
  actionButtonPressed: { opacity: 0.85 },
  actionButtonText: { color: theme.colors.copperBright, fontSize: 13.5, fontWeight: '700' },
  disabledAction: {
    minHeight: 40, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLine, borderRadius: theme.radius.precise,
    opacity: 0.55,
  },
  disabledActionText: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '700' },
});
