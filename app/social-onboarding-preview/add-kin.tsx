import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { KinAvatar } from '@/components/social/kin-avatar';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { AddKinOutcome, KinProfile, KinshipStatus } from '@/domain/social/types';
import { SAM } from '@/fixtures/social/onboarding-directory';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { KinDirectoryEntry, lookupUsername } from '@/lib/social/add-kin';

/**
 * Journey 3 — Add Kin by exact username, built on the approved model from
 * PR #13's `lib/social/add-kin.ts`. Sam is this package's one discoverable
 * fixture person; every required outcome (exact match, no match, already
 * Kin, pending, send, withdraw, "accepted from another session") is reached
 * by actually driving Sam through the real Kinship-request state, not by a
 * static outcome table.
 */
export default function AddKinScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { sendKinRequest, simulateOtherSessionAccepted, state, withdrawKinRequest } = useSocialOnboarding();
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<AddKinOutcome | null>(null);

  if (!state.identity.username) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.gateWrap}>
          <PrototypeTag />
          <Text accessibilityRole="header" style={styles.gateTitle}>You need a Kinwin username first</Text>
          <Text style={styles.gateBody}>
            Add Kin looks people up by exact username, so people who already know you can find
            you back. This only takes a moment.
          </Text>
          <AnimatedPrimaryButton
            accessibilityHint="Opens the username setup screen, then returns here"
            label="Choose a username"
            onPress={() => {
              void playImportantHaptic();
              router.push({ pathname: '/social-onboarding-preview/username', params: { next: 'add-kin' } } as Href);
            }}
            reducedMotion={reducedMotion}
          />
        </View>
      </SafeAreaView>
    );
  }

  const samStatus: KinshipStatus | null = state.approvedKin.some((kin) => kin.id === SAM.id)
    ? 'approved'
    : state.outgoing.some((request) => request.profile.id === SAM.id)
      ? 'pending_outgoing'
      : null;
  const directory: readonly KinDirectoryEntry[] = [{ profile: SAM, status: samStatus }];
  const outgoingRequest = state.outgoing.find((request) => request.profile.id === SAM.id);

  const search = () => {
    void playSelectionHaptic();
    setOutcome(lookupUsername(query, directory));
  };

  const sendRequest = (profile: KinProfile) => {
    void playImportantHaptic();
    sendKinRequest(profile);
    // Set the outcome directly rather than re-running lookupUsername against
    // `directory` — that variable was built from this render's (pre-update)
    // context state, so re-deriving from it here would show a stale result.
    setOutcome({ kind: 'request_pending', profile });
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
              accessibilityHint="Try sam_k to find Sam"
              accessibilityLabel="Exact username"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => { setQuery(value); setOutcome(null); }}
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
                <Pressable
                  accessibilityHint={`Sends a Kinship request to ${outcome.profile.displayName}`}
                  accessibilityRole="button"
                  onPress={() => sendRequest(outcome.profile)}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                >
                  <Text style={styles.actionButtonText}>Send Kinship request</Text>
                </Pressable>
              </ResultCard>
            )}

            {outcome.kind === 'already_kin' && (
              <ResultCard>
                <ProfileRow initials={outcome.profile.initials} name={outcome.profile.displayName} username={outcome.profile.username} />
                <Text style={styles.resultText}>You and {outcome.profile.displayName} are already Kin.</Text>
              </ResultCard>
            )}

            {outcome.kind === 'request_pending' && outgoingRequest && (
              <ResultCard>
                <ProfileRow initials={outcome.profile.initials} name={outcome.profile.displayName} username={outcome.profile.username} />
                <Text style={styles.resultText}>Your Kinship request to {outcome.profile.displayName} is pending.</Text>
                <View style={styles.pendingActions}>
                  <Pressable
                    accessibilityHint={`Withdraws your pending request to ${outcome.profile.displayName}`}
                    accessibilityRole="button"
                    onPress={() => {
                      void playSelectionHaptic();
                      withdrawKinRequest(outgoingRequest.id);
                      setOutcome(null);
                    }}
                    style={({ pressed }) => [styles.smallOutlineButton, pressed && styles.smallOutlineButtonPressed]}
                  >
                    <Text style={styles.smallOutlineButtonText}>Withdraw request</Text>
                  </Pressable>
                  <Pressable
                    accessibilityHint={`Prototype-only: simulates ${outcome.profile.displayName} accepting from their own device`}
                    accessibilityRole="button"
                    onPress={() => {
                      void playImportantHaptic();
                      simulateOtherSessionAccepted(outgoingRequest.id);
                      setOutcome({ kind: 'already_kin', profile: outcome.profile });
                    }}
                    style={({ pressed }) => [styles.smallOutlineButton, pressed && styles.smallOutlineButtonPressed]}
                  >
                    <Text style={styles.smallOutlineButtonText}>Simulate: they accepted</Text>
                  </Pressable>
                </View>
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
                <Pressable
                  accessibilityHint="Opens the invitation-link prototype for this person"
                  accessibilityRole="button"
                  onPress={() => { void playImportantHaptic(); router.push('/social-onboarding-preview/invite' as Href); }}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                >
                  <Text style={styles.actionButtonText}>Invite by link</Text>
                </Pressable>
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
  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  gateTitle: {
    color: theme.colors.bone, textAlign: 'center',
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 22, lineHeight: 28,
  },
  gateBody: { color: theme.colors.boneMuted, textAlign: 'center', fontSize: 13.5, lineHeight: 20, maxWidth: 320 },
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
  actionButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.copperSurface,
  },
  actionButtonPressed: { opacity: 0.85 },
  actionButtonText: { color: theme.colors.copperBright, fontSize: 13.5, fontWeight: '700' },
  pendingActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallOutlineButton: {
    minHeight: 40, justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    paddingHorizontal: 12,
  },
  smallOutlineButtonPressed: { backgroundColor: theme.colors.surfaceFocused },
  smallOutlineButtonText: { color: theme.colors.boneMuted, fontSize: 12.5, fontWeight: '700' },
});
