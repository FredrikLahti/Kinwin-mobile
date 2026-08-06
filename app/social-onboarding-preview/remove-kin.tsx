import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KinAvatar } from '@/components/social/kin-avatar';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { KinId, KinProfile } from '@/domain/social/types';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

/**
 * Journey 6 — the owner-facing UX for removing an approved Kin. This is not
 * a backend implementation: the confirmation is explicit about what does
 * and does not change, and deliberately does not invent a final
 * historical-comment/erasure policy (docs/SOCIAL_ONBOARDING_UX.md).
 */
export default function RemoveKinScreen() {
  const router = useRouter();
  const { removeKin, state } = useSocialOnboarding();
  const [selectedId, setSelectedId] = useState<KinId | null>(null);
  const [removedNote, setRemovedNote] = useState<string | null>(null);

  const selected = state.approvedKin.find((kin) => kin.id === selectedId) ?? null;

  const confirmRemoval = (kin: KinProfile) => {
    void playImportantHaptic();
    removeKin(kin.id);
    setSelectedId(null);
    setRemovedNote(`${kin.displayName} is no longer Kin.`);
  };

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
        </View>

        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>My Kin</Text>
          <Text style={styles.subtitle}>Tap someone to remove them as Kin.</Text>
        </View>

        {removedNote && (
          <View style={styles.statusNote}>
            <Text style={styles.statusNoteText}>{removedNote}</Text>
          </View>
        )}

        {state.approvedKin.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>You have no approved Kin yet.</Text>
            <Pressable
              accessibilityHint="Opens Add Kin"
              accessibilityRole="button"
              onPress={() => { void playImportantHaptic(); router.push('/social-onboarding-preview/add-kin' as Href); }}
              style={({ pressed }) => [styles.simulateButton, pressed && styles.simulateButtonPressed]}
            >
              <Text style={styles.simulateButtonText}>Add Kin</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {state.approvedKin.map((kin) => (
              <Pressable
                accessibilityHint={`Reviews removing ${kin.displayName} as Kin`}
                accessibilityRole="button"
                key={kin.id}
                onPress={() => { void playSelectionHaptic(); setSelectedId((current) => (current === kin.id ? null : kin.id)); }}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <KinAvatar initials={kin.initials} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{kin.displayName}</Text>
                  <Text style={styles.rowNote}>@{kin.username} · {kin.relationshipNote}</Text>
                </View>
                <Text style={styles.rowChevron}>{selectedId === kin.id ? '︿' : '﹀'}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {selected && (
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Remove {selected.displayName} as Kin?</Text>
            <Distinction
              body="This ends your Kinship — you won't be able to add each other back without sending a new request."
              label="THE KINSHIP ITSELF"
              resolved
            />
            <Distinction
              body={`${selected.displayName} is no longer eligible for any challenge you haven't already included them in — this is immediate for anything new.`}
              label="FUTURE, NOT-YET-AUTHORIZED CHALLENGES"
              resolved
            />
            <Distinction
              body={`Whether removing ${selected.displayName} immediately revokes their access to a challenge they can currently see is not decided. This prototype does not claim they're instantly removed from an already-active Challenge Room.`}
              label="AN ALREADY-ACTIVE CHALLENGE THEY CAN SEE"
            />
            <Distinction
              body="What happens to completed challenges they were already authorized to see is also undecided — nothing is erased by this action, but nothing is guaranteed to stay visible either."
              label="COMPLETED CHALLENGE HISTORY"
            />
            <Distinction
              body="Comments and reactions they already left are not automatically deleted by this action — same open decision as above."
              label="COMMENTS ALREADY MADE"
            />
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityHint={`Confirms removing ${selected.displayName} as Kin`}
                accessibilityRole="button"
                onPress={() => confirmRemoval(selected)}
                style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}
              >
                <Text style={styles.removeButtonText}>Remove Kin</Text>
              </Pressable>
              <Pressable
                accessibilityHint="Cancels without removing anyone"
                accessibilityRole="button"
                onPress={() => { void playSelectionHaptic(); setSelectedId(null); }}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Distinction({ body, label, resolved = false }: { body: string; label: string; resolved?: boolean }) {
  return (
    <View style={styles.distinction}>
      <View style={styles.distinctionHeader}>
        <Text style={styles.distinctionLabel}>{label}</Text>
        <Text style={[styles.distinctionTag, resolved ? styles.distinctionTagResolved : styles.distinctionTagUnresolved]}>
          {resolved ? 'DECIDED' : 'UNRESOLVED'}
        </Text>
      </View>
      <Text style={styles.distinctionBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  header: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 6,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.precise },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  intro: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 6, paddingHorizontal: 22, paddingTop: 12,
  },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 26, lineHeight: 32,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  statusNote: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    marginHorizontal: 22, marginTop: 10,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 10,
  },
  statusNoteText: { color: theme.colors.boneMuted, fontSize: 12, lineHeight: 17 },
  list: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    marginTop: 12, paddingHorizontal: 22,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 60,
    borderBottomWidth: 1, borderColor: theme.colors.structureLine,
  },
  rowPressed: { backgroundColor: theme.colors.surface },
  rowText: { flex: 1 },
  rowName: { color: theme.colors.bone, fontSize: 14.5, fontWeight: '700' },
  rowNote: { color: theme.colors.boneMuted, fontSize: 12, marginTop: 2 },
  rowChevron: { color: theme.colors.warmGrey, fontSize: 13 },
  emptyWrap: { alignItems: 'center', gap: 16, padding: 28, paddingTop: 40 },
  emptyTitle: { color: theme.colors.boneMuted, fontSize: 14, textAlign: 'center' },
  simulateButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface, paddingHorizontal: 16,
  },
  simulateButtonPressed: { backgroundColor: theme.colors.surfaceFocused },
  simulateButtonText: { color: theme.colors.bone, fontSize: 13, fontWeight: '700' },
  confirmCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 14, marginHorizontal: 22, marginTop: 20,
    borderWidth: 1, borderColor: '#E37D6A', borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 18,
  },
  confirmTitle: { color: theme.colors.bone, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  distinction: { gap: 4 },
  distinctionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  distinctionLabel: { flex: 1, color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  distinctionTag: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8 },
  distinctionTagResolved: { color: theme.colors.boneMuted },
  distinctionTagUnresolved: { color: '#E37D6A' },
  distinctionBody: { color: theme.colors.boneMuted, fontSize: 12.5, lineHeight: 18 },
  confirmActions: { gap: 10, marginTop: 4 },
  removeButton: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E37D6A', borderRadius: theme.radius.precise,
    backgroundColor: '#3A2019',
  },
  removeButtonPressed: { opacity: 0.85 },
  removeButtonText: { color: '#E37D6A', fontSize: 14, fontWeight: '700' },
  cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '700' },
});
