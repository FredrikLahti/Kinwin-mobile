import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { ChallengeAudience, ChallengeDetailLevel, KinId } from '@/domain/social/types';
// This screen is the owner-facing exception to the projection boundary: it
// intentionally reads the PRIVATE challenge record and runs the real
// authorization function live, because the whole point is letting the owner
// preview what different Kin viewers will receive before choosing settings.
// No other screen may import fixtures/social/private-challenges.ts.
import { PRIVATE_CHALLENGES } from '@/fixtures/social/private-challenges';
import { APPROVED_KIN, KIN_PROFILES } from '@/fixtures/social/kin';
import { playSelectionHaptic } from '@/lib/haptics';
import { projectSocialChallenge } from '@/lib/social/projection';

const SUBJECT_CHALLENGE = PRIVATE_CHALLENGES[0];
const PREVIEW_VIEWER = KIN_PROFILES.priya;

const AUDIENCE_OPTIONS: { readonly value: ChallengeAudience; readonly label: string }[] = [
  { value: 'only_me', label: 'Only me' },
  { value: 'all_kin', label: 'All my Kin' },
  { value: 'selected_kin', label: 'Selected Kin' },
];

const DETAIL_OPTIONS: { readonly value: ChallengeDetailLevel; readonly label: string }[] = [
  { value: 'exact', label: 'Exact challenge' },
  { value: 'general', label: 'General version' },
  { value: 'progress_only', label: 'Progress only' },
];

export default function AudiencePreviewScreen() {
  const router = useRouter();
  const [audience, setAudience] = useState<ChallengeAudience>(SUBJECT_CHALLENGE.audience);
  const [detail, setDetail] = useState<ChallengeDetailLevel>(SUBJECT_CHALLENGE.detailLevel);
  const [selectedKinIds, setSelectedKinIds] = useState<readonly KinId[]>([]);

  const toggleSelected = (id: KinId) => {
    void playSelectionHaptic();
    setSelectedKinIds((current) =>
      current.includes(id) ? current.filter((kinId) => kinId !== id) : [...current, id],
    );
  };

  const previewProjection = useMemo(() => {
    const candidate = { ...SUBJECT_CHALLENGE, audience, detailLevel: detail, selectedKinIds };
    return projectSocialChallenge(candidate, { id: PREVIEW_VIEWER.id, isApprovedKin: true });
  }, [audience, detail, selectedKinIds]);

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
          <Text accessibilityRole="header" style={styles.title}>Who sees this, and how much?</Text>
          <Text style={styles.subtitle}>
            These are the settings for &quot;{SUBJECT_CHALLENGE.exactTitle}&quot;. Choose an audience and a
            detail level, then see exactly what an approved Kin would receive.
          </Text>
        </View>

        <Field label="AUDIENCE">
          <SegmentGroup
            onSelect={setAudience}
            options={AUDIENCE_OPTIONS}
            selected={audience}
          />
        </Field>

        {audience === 'selected_kin' && (
          <Field label="SELECTED KIN">
            <View style={styles.chipRow}>
              {APPROVED_KIN.map((kin) => {
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
          </Field>
        )}

        <Field label="VISIBLE DETAIL">
          <SegmentGroup
            onSelect={setDetail}
            options={DETAIL_OPTIONS}
            selected={detail}
          />
        </Field>

        <View style={styles.previewHeader}>
          <Text style={styles.previewEyebrow}>PREVIEW — WHAT {PREVIEW_VIEWER.displayName.toUpperCase()} WOULD SEE</Text>
          <Text style={styles.previewCaption}>{PREVIEW_VIEWER.displayName} is an approved Kin, previewed exactly as they would experience it.</Text>
        </View>

        {previewProjection ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{previewProjection.title}</Text>
            <Text style={styles.previewDescription}>{previewProjection.description}</Text>
            <View style={styles.previewProgressTrack}>
              <View style={[styles.previewProgressFill, { width: `${Math.round(previewProjection.progressRatio * 100)}%` }]} />
            </View>
            <Text style={styles.previewProgressLabel}>{previewProjection.progressLabel}</Text>
            {previewProjection.consequenceSummary && (
              <Text style={styles.previewConsequence}>{previewProjection.consequenceSummary}</Text>
            )}
            {previewProjection.recipientNames && previewProjection.recipientNames.length > 0 && (
              <Text style={styles.previewRecipients}>For: {previewProjection.recipientNames.join(', ')}</Text>
            )}
          </View>
        ) : (
          <View style={styles.previewCard}>
            <Text style={styles.previewEmpty}>
              {PREVIEW_VIEWER.displayName} would not see this challenge at all — it wouldn&apos;t appear
              in their Kin feed or anywhere else.
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

function SegmentGroup<Value extends string>({
  onSelect,
  options,
  selected,
}: {
  onSelect: (value: Value) => void;
  options: readonly { readonly value: Value; readonly label: string }[];
  selected: Value;
}) {
  return (
    <View style={styles.segmentGroup}>
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            accessibilityHint={`Sets this to ${option.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => { void playSelectionHaptic(); onSelect(option.value); }}
            style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.segmentPressed]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
  previewHeader: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 4, paddingHorizontal: 22, paddingTop: 30,
  },
  previewEyebrow: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  previewCaption: { color: theme.colors.warmGrey, fontSize: 11.5, lineHeight: 16 },
  previewCard: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    gap: 10, marginHorizontal: 22, marginTop: 12,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surfaceRaised, padding: 18,
  },
  previewTitle: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 20, lineHeight: 26,
  },
  previewDescription: { color: theme.colors.boneMuted, fontSize: 13.5, lineHeight: 20 },
  previewProgressTrack: { height: 6, borderRadius: 3, backgroundColor: theme.colors.structureLine, overflow: 'hidden', marginTop: 4 },
  previewProgressFill: { height: '100%', backgroundColor: theme.colors.copperBright },
  previewProgressLabel: { color: theme.colors.bone, fontSize: 13, fontWeight: '700' },
  previewConsequence: { color: theme.colors.bone, fontSize: 13, lineHeight: 19, marginTop: 4 },
  previewRecipients: { color: theme.colors.boneMuted, fontSize: 12, fontWeight: '600' },
  previewEmpty: { color: theme.colors.boneMuted, fontSize: 13.5, lineHeight: 20 },
});
