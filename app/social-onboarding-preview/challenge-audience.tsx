import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { KinshipRequestId } from '@/domain/social/onboarding';
import { KinId } from '@/domain/social/types';
import { NORA } from '@/fixtures/social/onboarding-directory';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { hasSocialVisibility, kinHasAccess } from '@/lib/social/challenge-audience';

const DRAFT_CHALLENGE_TITLE = 'Reading 20 pages every night';
const DRAFT_PROGRESS_LABEL = 'Day 1 of 30';

type StartChoice = 'new' | 'continue';

/**
 * Journey 7 — the first social challenge-audience transition, once a user
 * has their first accepted Kin. Uses this package's own
 * `OnboardingChallengeAudience` snapshot model (see
 * `domain/social/onboarding.ts`) rather than PR #13's
 * `fixtures/social/private-challenges.ts` — no private challenge data is
 * duplicated into this screen, only a generic fixture title/progress.
 */
export default function ChallengeAudienceScreen() {
  const router = useRouter();
  const { acceptIncoming, chooseAllKinAudience, chooseOnlyMeAudience, chooseSelectedKinAudience, receiveIncomingRequest, state } =
    useSocialOnboarding();
  const [startChoice, setStartChoice] = useState<StartChoice | null>(null);
  const [selectedKinIds, setSelectedKinIds] = useState<readonly KinId[]>([]);

  const audience = state.audience;
  const previewViewer = state.approvedKin[0] ?? null;

  const toggleSelected = (id: KinId) => {
    void playSelectionHaptic();
    const next = selectedKinIds.includes(id) ? selectedKinIds.filter((kinId) => kinId !== id) : [...selectedKinIds, id];
    setSelectedKinIds(next);
    chooseSelectedKinAudience(next);
  };

  const simulateLaterKin = () => {
    void playImportantHaptic();
    receiveIncomingRequest(NORA);
    acceptIncoming(`incoming-${NORA.id}` as KinshipRequestId);
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
          <Text accessibilityRole="header" style={styles.title}>Now that you have Kin…</Text>
          <Text style={styles.subtitle}>
            Nothing changes automatically. You still choose, per challenge, who — if anyone — sees
            it.
          </Text>
        </View>

        <Field label="THIS CHALLENGE">
          <View style={styles.segmentGroup}>
            <Segment
              active={startChoice === 'new'}
              label="Start a new challenge"
              onPress={() => { void playSelectionHaptic(); setStartChoice('new'); }}
            />
            <Segment
              active={startChoice === 'continue'}
              label="Continue solo draft"
              onPress={() => { void playSelectionHaptic(); setStartChoice('continue'); }}
            />
          </View>
        </Field>

        <Field label="WHO CAN SEE IT">
          <View style={styles.segmentGroup}>
            <Segment
              active={audience.kind === 'only_me'}
              label="Only me"
              onPress={() => { void playSelectionHaptic(); chooseOnlyMeAudience(); setSelectedKinIds([]); }}
            />
            <Segment
              active={audience.kind === 'selected_kin'}
              label="Selected Kin"
              onPress={() => { void playSelectionHaptic(); chooseSelectedKinAudience(selectedKinIds); }}
            />
            <Segment
              active={audience.kind === 'all_kin_snapshot'}
              label="All my Kin"
              onPress={() => { void playImportantHaptic(); chooseAllKinAudience(); }}
            />
          </View>
          <Text style={styles.helperText}>
            {audience.kind === 'only_me' && 'The safe default — no one sees this challenge.'}
            {audience.kind === 'selected_kin' && "Pick who's in. Nobody is preselected, and it stays private until you pick at least one person."}
            {audience.kind === 'all_kin_snapshot' && 'Everyone currently approved gets access — but not automatically anyone you add later.'}
          </Text>
        </Field>

        {audience.kind === 'selected_kin' && (
          <Field label="SELECTED KIN">
            {state.approvedKin.length === 0 ? (
              <Text style={styles.helperText}>You have no approved Kin to select yet.</Text>
            ) : (
              <View style={styles.chipRow}>
                {state.approvedKin.map((kin) => {
                  const active = selectedKinIds.includes(kin.id);
                  return (
                    <Pressable
                      accessibilityHint={`${active ? 'Removes' : 'Adds'} ${kin.displayName} from this challenge's audience`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      key={kin.id}
                      onPress={() => toggleSelected(kin.id)}
                      style={({ pressed }) => [styles.kinChip, active && styles.kinChipActive, pressed && styles.kinChipPressed]}
                    >
                      <Text style={[styles.kinChipText, active && styles.kinChipTextActive]}>{kin.displayName}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Field>
        )}

        {audience.kind === 'all_kin_snapshot' && state.approvedKin.length > 0 && (
          <Field label="WHO CURRENTLY HAS ACCESS">
            {state.approvedKin.map((kin) => (
              <View key={kin.id} style={styles.accessRow}>
                <Text style={styles.accessMark}>{kinHasAccess(audience, kin.id) ? '✓' : '—'}</Text>
                <Text style={styles.accessName}>{kin.displayName}</Text>
                {!kinHasAccess(audience, kin.id) && <Text style={styles.accessNote}>joined after — no retroactive access</Text>}
              </View>
            ))}
            <Pressable
              accessibilityHint="Prototype-only: simulates Nora becoming Kin after this audience was chosen"
              accessibilityRole="button"
              onPress={simulateLaterKin}
              style={({ pressed }) => [styles.simulateButton, pressed && styles.simulateButtonPressed]}
            >
              <Text style={styles.simulateButtonText}>Simulate: Nora becomes Kin now</Text>
            </Pressable>
          </Field>
        )}

        <View style={styles.previewHeader}>
          <Text style={styles.previewEyebrow}>
            PREVIEW — WHAT {previewViewer ? previewViewer.displayName.toUpperCase() : 'YOUR KIN'} WOULD SEE
          </Text>
        </View>

        {previewViewer && hasSocialVisibility(audience) && kinHasAccess(audience, previewViewer.id) ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{DRAFT_CHALLENGE_TITLE}</Text>
            <Text style={styles.previewProgress}>{DRAFT_PROGRESS_LABEL}</Text>
          </View>
        ) : (
          <View style={styles.previewCard}>
            <Text style={styles.previewEmpty}>
              {!previewViewer
                ? 'You have no Kin yet, so there is no one to preview this for.'
                : !hasSocialVisibility(audience)
                  ? `${previewViewer.displayName} would not see this challenge at all — it stays private.`
                  : `${previewViewer.displayName} wasn't included, so they would not see this challenge.`}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityHint={`Sets this to ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.segmentPressed]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { paddingBottom: 40 },
  header: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 6,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.precise },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  intro: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 8, paddingHorizontal: 22, paddingTop: 10,
  },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 25, lineHeight: 31,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  field: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 10, paddingHorizontal: 22, paddingTop: 22,
  },
  fieldLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  segmentGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: {
    minHeight: 40, justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: 999,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14,
  },
  segmentActive: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperSurface },
  segmentPressed: { opacity: 0.85 },
  segmentText: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: theme.colors.copperBright },
  helperText: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kinChip: {
    minHeight: 36, justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLine, borderRadius: 999,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12,
  },
  kinChipActive: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperSurface },
  kinChipPressed: { opacity: 0.85 },
  kinChipText: { color: theme.colors.boneMuted, fontSize: 12.5, fontWeight: '600' },
  kinChipTextActive: { color: theme.colors.copperBright },
  accessRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accessMark: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '800', width: 16 },
  accessName: { color: theme.colors.bone, fontSize: 13, fontWeight: '700' },
  accessNote: { color: theme.colors.warmGrey, fontSize: 11.5, flexShrink: 1 },
  simulateButton: {
    minHeight: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12, marginTop: 4,
  },
  simulateButtonPressed: { backgroundColor: theme.colors.surfaceFocused },
  simulateButtonText: { color: theme.colors.bone, fontSize: 12, fontWeight: '700' },
  previewHeader: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 4, paddingHorizontal: 22, paddingTop: 30,
  },
  previewEyebrow: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  previewCard: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 8, marginHorizontal: 22, marginTop: 12,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surfaceRaised, padding: 18,
  },
  previewTitle: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 19, lineHeight: 25,
  },
  previewProgress: { color: theme.colors.bone, fontSize: 13, fontWeight: '700' },
  previewEmpty: { color: theme.colors.boneMuted, fontSize: 13.5, lineHeight: 20 },
});
