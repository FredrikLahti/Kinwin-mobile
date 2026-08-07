import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { KinAvatar } from '@/components/social/kin-avatar';
import { OverflowMenu } from '@/components/social/overflow-menu';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { THEO } from '@/fixtures/social/onboarding-directory';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

/**
 * Journey 5 — an incoming Kinship request from Theo, with accept, decline,
 * and a block/report entry point, followed by a restrained "now Kin"
 * confirmation once accepted (docs/SOCIAL_ONBOARDING_UX.md).
 */
export default function IncomingRequestScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { acceptIncoming, declineIncoming, receiveIncomingRequest, state } = useSocialOnboarding();
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const request = state.incoming.find((candidate) => candidate.profile.id === THEO.id) ?? state.incoming[0];

  const overflowActions = request
    ? [
        {
          key: 'report',
          label: `Report ${request.profile.displayName}`,
          hint: 'Flags this request for review',
          destructive: true,
          onSelect: () => {
            void playImportantHaptic();
            setStatusNote(`Reported. This is a prototype — nothing was sent.`);
          },
        },
        {
          key: 'block',
          label: `Block ${request.profile.displayName}`,
          hint: `Blocks ${request.profile.displayName} and clears their request`,
          destructive: true,
          onSelect: () => {
            void playImportantHaptic();
            declineIncoming(request.id);
            setStatusNote(`${request.profile.displayName} would be blocked. Nothing changed beyond clearing the request — this is a prototype.`);
          },
        },
      ]
    : [];

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Returns to the previous screen"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Text aria-hidden style={styles.backIcon}>‹</Text>
          </Pressable>
          <PrototypeTag />
          {request && <OverflowMenu accessibilityLabel="Request options" actions={overflowActions} />}
        </View>

        {statusNote && (
          <View style={styles.statusNote}>
            <Text style={styles.statusNoteText}>{statusNote}</Text>
          </View>
        )}

        {request ? (
          <>
            <View style={styles.intro}>
              <Text accessibilityRole="header" style={styles.title}>Incoming request</Text>
              <Text style={styles.subtitle}>Someone wants to be your Kin.</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.profileRow}>
                <KinAvatar initials={request.profile.initials} size={52} />
                <View>
                  <Text style={styles.profileName}>{request.profile.displayName}</Text>
                  <Text style={styles.profileUsername}>@{request.profile.username} · {request.profile.relationshipNote}</Text>
                </View>
              </View>
              <Text style={styles.hint}>
                This is all Kinwin shows before you decide — no shared challenges, no history, no
                mutual-friend list.
              </Text>
              <View style={styles.actionsRow}>
                <AnimatedPrimaryButton
                  accessibilityHint={`Accepts ${request.profile.displayName}'s Kinship request`}
                  label="Accept"
                  onPress={() => { void playImportantHaptic(); acceptIncoming(request.id); }}
                  reducedMotion={reducedMotion}
                />
                <Pressable
                  accessibilityHint={`Declines ${request.profile.displayName}'s Kinship request`}
                  accessibilityRole="button"
                  onPress={() => { void playSelectionHaptic(); declineIncoming(request.id); }}
                  style={({ pressed }) => [styles.declineButton, pressed && styles.declineButtonPressed]}
                >
                  <Text style={styles.declineButtonText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : state.approvedKin.length > 0 ? (
          <>
            <View style={styles.confirmedCard}>
              <Text style={styles.confirmedLabel}>NOW KIN</Text>
              <Text style={styles.confirmedTitle}>
                You and {state.approvedKin[state.approvedKin.length - 1].displayName} are now Kin.
              </Text>
              <Text style={styles.confirmedBody}>
                They still can&apos;t see any challenge unless you explicitly include them in
                one&apos;s audience — and if you have past challenges, those stay exactly as
                private as they were before.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MY KIN ({state.approvedKin.length})</Text>
              {state.approvedKin.map((kin) => (
                <View key={kin.id} style={styles.row}>
                  <KinAvatar initials={kin.initials} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{kin.displayName}</Text>
                    <Text style={styles.rowNote}>@{kin.username} · {kin.relationshipNote}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityHint="Opens the challenge audience transition preview"
              accessibilityRole="button"
              onPress={() => { void playImportantHaptic(); router.push('/social-onboarding-preview/challenge-audience' as Href); }}
              style={({ pressed }) => [styles.nextLink, pressed && styles.nextLinkPressed]}
            >
              <Text style={styles.nextLinkText}>See what changes for your next challenge →</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No pending Kinship requests right now.</Text>
            <Pressable
              accessibilityHint="Prototype-only: simulates Theo sending you a Kinship request"
              accessibilityRole="button"
              onPress={() => { void playImportantHaptic(); receiveIncomingRequest(THEO); }}
              style={({ pressed }) => [styles.simulateButton, pressed && styles.simulateButtonPressed]}
            >
              <Text style={styles.simulateButtonText}>Simulate: Theo sent you a request</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  header: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingHorizontal: 14, paddingTop: 6,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.precise },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  statusNote: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    marginHorizontal: 22, marginTop: 6,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 10,
  },
  statusNoteText: { color: theme.colors.boneMuted, fontSize: 12, lineHeight: 17 },
  intro: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 6, paddingHorizontal: 22, paddingTop: 12,
  },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 24, lineHeight: 30,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  card: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 14, marginHorizontal: 22, marginTop: 18,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 18,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileName: { color: theme.colors.bone, fontSize: 17, fontWeight: '700' },
  profileUsername: { color: theme.colors.boneMuted, fontSize: 12.5, marginTop: 3 },
  hint: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  actionsRow: { gap: 10 },
  declineButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  declineButtonPressed: { opacity: 0.7 },
  declineButtonText: { color: theme.colors.boneMuted, fontSize: 13.5, fontWeight: '700' },
  confirmedCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, marginHorizontal: 22, marginTop: 18,
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.copperSurface, padding: 18,
  },
  confirmedLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  confirmedTitle: { color: theme.colors.bone, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  confirmedBody: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 20 },
  section: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 12, marginTop: 22,
    borderTopWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 22, paddingVertical: 16,
  },
  sectionLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1 },
  rowName: { color: theme.colors.bone, fontSize: 14.5, fontWeight: '700' },
  rowNote: { color: theme.colors.boneMuted, fontSize: 12, marginTop: 2 },
  nextLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 22, marginTop: 6 },
  nextLinkPressed: { opacity: 0.7 },
  nextLinkText: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 28, paddingTop: 60 },
  emptyTitle: { color: theme.colors.boneMuted, fontSize: 14, textAlign: 'center' },
  simulateButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface, paddingHorizontal: 16,
  },
  simulateButtonPressed: { backgroundColor: theme.colors.surfaceFocused },
  simulateButtonText: { color: theme.colors.bone, fontSize: 13, fontWeight: '700' },
});
