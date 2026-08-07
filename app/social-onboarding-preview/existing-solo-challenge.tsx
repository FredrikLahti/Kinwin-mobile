import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { SoloChallengeFixture } from '@/domain/social/onboarding';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const EXISTING_CHALLENGE: SoloChallengeFixture = {
  id: 'onboarding-solo-meditation',
  title: 'Meditate 10 minutes every morning',
  statusLabel: 'Active · Day 9 of 30 · Only me',
  kind: 'active',
};

/**
 * Journey 8 — a user who already has a solo draft/active challenge and
 * later adds their first Kin. The product must not pressure them to expose
 * it, and must not assume an already-active challenge's visibility can
 * change at all — this prototype does not let you try, because pretending
 * to support that here would misrepresent an unresolved decision
 * (docs/SOCIAL_ONBOARDING_UX.md).
 */
export default function ExistingSoloChallengeScreen() {
  const router = useRouter();
  const { state } = useSocialOnboarding();
  const [acknowledged, setAcknowledged] = useState(false);

  const firstKinName = state.approvedKin[0]?.displayName ?? null;

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
          <Text accessibilityRole="header" style={styles.title}>Your existing challenge stays yours</Text>
          <Text style={styles.subtitle}>
            {firstKinName
              ? `You just added ${firstKinName} as Kin. Here's what happens to the challenge you already had running.`
              : "Imagine you already had a challenge running, and just added your first Kin. Here's what happens to it."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{EXISTING_CHALLENGE.title}</Text>
          <Text style={styles.cardStatus}>{EXISTING_CHALLENGE.statusLabel}</Text>
          <View style={styles.privateBadge}>
            <Text style={styles.privateBadgeText}>STILL ONLY ME</Text>
          </View>
        </View>

        <Text style={styles.explainer}>
          Adding Kin never changes an existing challenge on its own. Nothing about this one
          becomes visible, discussable, or discoverable just because you now have someone who
          could see it.
        </Text>

        <View style={styles.optionsCard}>
          <Pressable
            accessibilityHint="Confirms you'd like to keep this specific challenge private"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); setAcknowledged(true); }}
            style={({ pressed }) => [styles.option, styles.optionPrimary, pressed && styles.optionPressed]}
          >
            <Text style={styles.optionPrimaryText}>Keep this challenge private</Text>
            <Text style={styles.optionCaption}>Nothing to do — this is already true, and staying here changes nothing.</Text>
          </Pressable>

          <Pressable
            accessibilityHint="Opens the audience choice for your next challenge, leaving this one untouched"
            accessibilityRole="button"
            onPress={() => { void playImportantHaptic(); router.push('/social-onboarding-preview/challenge-audience' as Href); }}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
          >
            <Text style={styles.optionText}>Use Kin on your next challenge instead</Text>
            <Text style={styles.optionCaption}>This one keeps running exactly as it is.</Text>
          </Pressable>
        </View>

        {acknowledged && (
          <View style={styles.confirmedNote}>
            <Text style={styles.confirmedNoteText}>Good — nothing changed. That was the point.</Text>
          </View>
        )}

        <View style={styles.unresolvedCard}>
          <Text style={styles.unresolvedLabel}>WHY THERE&apos;S NO &quot;MAKE IT VISIBLE&quot; BUTTON HERE</Text>
          <Text style={styles.unresolvedBody}>
            Whether an already-active challenge&apos;s visibility can ever be widened or narrowed
            after the fact is still an open product decision (see docs/SOCIAL_ONBOARDING_UX.md).
            This prototype doesn&apos;t offer that option, rather than quietly assuming an answer
            that hasn&apos;t actually been decided.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
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
    gap: 8, paddingHorizontal: 22, paddingTop: 10,
  },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 23, lineHeight: 29,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13.5, lineHeight: 20 },
  card: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, marginHorizontal: 22, marginTop: 20,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 18,
  },
  cardTitle: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 19, lineHeight: 25,
  },
  cardStatus: { color: theme.colors.boneMuted, fontSize: 12.5, fontWeight: '600' },
  privateBadge: {
    alignSelf: 'flex-start', minHeight: 26, justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: 999,
    paddingHorizontal: 10, marginTop: 4,
  },
  privateBadgeText: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  explainer: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    color: theme.colors.boneMuted, fontSize: 13, lineHeight: 20,
    paddingHorizontal: 22, paddingTop: 18,
  },
  optionsCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, paddingHorizontal: 22, paddingTop: 20,
  },
  option: {
    gap: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 14,
  },
  optionPrimary: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperSurface },
  optionPressed: { opacity: 0.85 },
  optionPrimaryText: { color: theme.colors.bone, fontSize: 14, fontWeight: '700' },
  optionText: { color: theme.colors.bone, fontSize: 14, fontWeight: '700' },
  optionCaption: { color: theme.colors.boneMuted, fontSize: 12, lineHeight: 17 },
  confirmedNote: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    marginHorizontal: 22, marginTop: 4,
  },
  confirmedNoteText: { color: theme.colors.copperBright, fontSize: 12.5, fontWeight: '700' },
  unresolvedCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 8, marginHorizontal: 22, marginTop: 26,
    borderTopWidth: 1, borderColor: theme.colors.structureLine, paddingTop: 18,
  },
  unresolvedLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  unresolvedBody: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
});
