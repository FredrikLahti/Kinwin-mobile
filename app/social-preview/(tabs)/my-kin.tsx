import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { KinAvatar } from '@/components/social/kin-avatar';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { KinProfile } from '@/domain/social/types';
import { APPROVED_KIN, PENDING_INCOMING, PENDING_OUTGOING } from '@/fixtures/social/kin';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

export default function MyKinScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [approved, setApproved] = useState<readonly KinProfile[]>(APPROVED_KIN);
  const [incoming, setIncoming] = useState<readonly KinProfile[]>(PENDING_INCOMING);
  const [outgoing, setOutgoing] = useState<readonly KinProfile[]>(PENDING_OUTGOING);

  const accept = (profile: KinProfile) => {
    void playImportantHaptic();
    setIncoming((current) => current.filter((kin) => kin.id !== profile.id));
    setApproved((current) => [...current, profile]);
  };

  const decline = (profile: KinProfile) => {
    void playSelectionHaptic();
    setIncoming((current) => current.filter((kin) => kin.id !== profile.id));
  };

  const cancelOutgoing = (profile: KinProfile) => {
    void playSelectionHaptic();
    setOutgoing((current) => current.filter((kin) => kin.id !== profile.id));
  };

  return (
    <SafeAreaView edges={['top', 'right', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <PrototypeTag />
          <Text accessibilityRole="header" style={styles.title}>My Kin</Text>
          <Text style={styles.subtitle}>Mutual, approved friends and family — not followers.</Text>
          <AnimatedPrimaryButton
            accessibilityHint="Opens the Add Kin prototype flow"
            label="Add Kin"
            onPress={() => { void playImportantHaptic(); router.push('/social-preview/add-kin' as Href); }}
            reducedMotion={reducedMotion}
          />
        </View>

        {incoming.length > 0 && (
          <Section label={`INCOMING REQUESTS (${incoming.length})`}>
            {incoming.map((profile) => (
              <View key={profile.id} style={styles.row}>
                <KinAvatar initials={profile.initials} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{profile.displayName}</Text>
                  <Text style={styles.note}>@{profile.username} · wants to be Kin</Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    accessibilityHint={`Accepts ${profile.displayName}'s Kinship request`}
                    accessibilityRole="button"
                    onPress={() => accept(profile)}
                    style={({ pressed }) => [styles.smallButton, styles.acceptButton, pressed && styles.smallButtonPressed]}
                  >
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    accessibilityHint={`Declines ${profile.displayName}'s Kinship request`}
                    accessibilityRole="button"
                    onPress={() => decline(profile)}
                    style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                  >
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Section>
        )}

        {outgoing.length > 0 && (
          <Section label={`SENT REQUESTS (${outgoing.length})`}>
            {outgoing.map((profile) => (
              <View key={profile.id} style={styles.row}>
                <KinAvatar initials={profile.initials} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{profile.displayName}</Text>
                  <Text style={styles.note}>@{profile.username} · request pending</Text>
                </View>
                <Pressable
                  accessibilityHint={`Cancels your Kinship request to ${profile.displayName}`}
                  accessibilityRole="button"
                  onPress={() => cancelOutgoing(profile)}
                  style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={styles.declineButtonText}>Cancel</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        )}

        <Section label={`MY KIN (${approved.length})`}>
          {approved.length === 0 && (
            <Text style={styles.empty}>No approved Kin yet. Add Kin to get started.</Text>
          )}
          {approved.map((profile) => (
            <View key={profile.id} style={styles.row}>
              <KinAvatar initials={profile.initials} />
              <View style={styles.rowText}>
                <Text style={styles.name}>{profile.displayName}</Text>
                <Text style={styles.note}>@{profile.username} · {profile.relationshipNote}</Text>
              </View>
            </View>
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { paddingBottom: 40 },
  header: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 10, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8,
  },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 28, lineHeight: 34, marginTop: 4,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  section: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 12,
    borderTopWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 22, paddingVertical: 16,
  },
  sectionLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1 },
  name: { color: theme.colors.bone, fontSize: 14.5, fontWeight: '700' },
  note: { color: theme.colors.boneMuted, fontSize: 12, marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 8 },
  smallButton: {
    minHeight: 36, justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    paddingHorizontal: 12,
  },
  smallButtonPressed: { backgroundColor: theme.colors.surfaceFocused },
  acceptButton: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperSurface },
  acceptButtonText: { color: theme.colors.copperBright, fontSize: 12.5, fontWeight: '700' },
  declineButtonText: { color: theme.colors.boneMuted, fontSize: 12.5, fontWeight: '700' },
  empty: { color: theme.colors.warmGrey, fontSize: 13, lineHeight: 19 },
});
