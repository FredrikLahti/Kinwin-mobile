import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { SAM, THEO } from '@/fixtures/social/onboarding-directory';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

export default function SocialOnboardingPreviewEntry() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { markContinuedSolo, resetToColdStart, seedApprovedKinForReview, seedIdentityForReview } = useSocialOnboarding();

  const startJourney = () => {
    void playImportantHaptic();
    resetToColdStart();
    router.push('/social-onboarding-preview/cold-start' as Href);
  };

  const jumpTo = (path: string, prepare?: () => void) => {
    void playSelectionHaptic();
    prepare?.();
    router.push(path as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
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

        <View style={styles.noticeCard}>
          <Text style={styles.noticeLabel}>INTERNAL PROTOTYPE</Text>
          <Text style={styles.noticeTitle}>Illustrative only — nothing here is saved.</Text>
          <Text style={styles.noticeBody}>
            Every person, username, Kinship request, invitation, and audience choice on the
            following screens is local fixture data for evaluating Kinwin&apos;s social cold
            start. Nothing is sent to a server, no real invitation link or account is created, and
            reloading resets everything — see docs/SOCIAL_ONBOARDING_UX.md for the full write-up.
          </Text>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>KIN · SOCIAL ONBOARDING</Text>
          <Text style={styles.title}>No Kin → an optional identity → your first Kinship.</Text>
          <Text style={styles.subtitle}>
            A brand-new user with zero Kin, choosing whether to add someone, invite someone, or
            stay solo — and what happens the moment their first Kin says yes.
          </Text>
        </View>

        <View style={styles.actions}>
          <AnimatedPrimaryButton
            accessibilityHint="Resets the prototype to a genuine zero-Kin cold start and begins the click-through journey"
            label="Start the cold-start journey"
            onPress={startJourney}
            reducedMotion={reducedMotion}
          />
        </View>

        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>JUMP TO A SCREEN FOR REVIEW</Text>
          <Text style={styles.reviewCaption}>
            Each link sets up the fixture state that screen needs, so you can review any moment in
            the journey without re-clicking the whole flow.
          </Text>

          <ReviewLink
            hint="A brand-new user with no Kin, no requests, and no username yet"
            label="1. First Kin visit — no Kin at all"
            onPress={() => jumpTo('/social-onboarding-preview/cold-start', () => resetToColdStart())}
          />
          <ReviewLink
            hint="The same screen after choosing to continue without adding anyone"
            label="2. Respected solo continuation"
            onPress={() =>
              jumpTo('/social-onboarding-preview/cold-start', () => {
                resetToColdStart();
                markContinuedSolo();
              })
            }
          />
          <ReviewLink
            hint="Try alex_r (taken) or sam_k (available) to see both outcomes"
            label="3. Choose a Kinwin username"
            onPress={() => jumpTo('/social-onboarding-preview/username', () => resetToColdStart())}
          />
          <ReviewLink
            hint="Search sam_k for an exact match, or anything else for no match"
            label="4. Add Kin — exact match, no match, pending, already Kin"
            onPress={() => jumpTo('/social-onboarding-preview/add-kin', () => seedIdentityForReview('you_preview'))}
          />
          <ReviewLink
            hint="The illustrative invitation link and message, reached from Add Kin's no-match state"
            label="5. Invite someone without Kinwin"
            onPress={() => jumpTo('/social-onboarding-preview/invite', () => seedIdentityForReview('you_preview'))}
          />
          <ReviewLink
            hint="Theo's incoming Kinship request, with accept/decline/block/report"
            label="6. Incoming Kinship request"
            onPress={() =>
              jumpTo('/social-onboarding-preview/incoming-request', () => {
                seedIdentityForReview('you_preview');
                seedApprovedKinForReview([]);
              })
            }
          />
          <ReviewLink
            hint="Theo already accepted — the restrained “now Kin” confirmation"
            label="7. First accepted Kin"
            onPress={() =>
              jumpTo('/social-onboarding-preview/incoming-request', () => {
                seedIdentityForReview('you_preview');
                seedApprovedKinForReview([THEO]);
              })
            }
          />
          <ReviewLink
            hint="Removing an approved Kin, with the future-vs-history distinction spelled out"
            label="8. Remove Kin confirmation"
            onPress={() =>
              jumpTo('/social-onboarding-preview/remove-kin', () => seedApprovedKinForReview([THEO, SAM]))
            }
          />
          <ReviewLink
            hint="Only me / Selected Kin / All my Kin, with the Selected Kin picker"
            label="9. First challenge audience choice"
            onPress={() =>
              jumpTo('/social-onboarding-preview/challenge-audience', () => seedApprovedKinForReview([THEO, SAM]))
            }
          />
          <ReviewLink
            hint="A user who already has a solo challenge, meeting their first Kin"
            label="10. Existing solo challenge after adding Kin"
            onPress={() => jumpTo('/social-onboarding-preview/existing-solo-challenge')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReviewLink({ hint, label, onPress }: { hint: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.reviewLink, pressed && styles.reviewLinkPressed]}
    >
      <Text style={styles.reviewLinkText}>{label}</Text>
      <Text aria-hidden style={styles.reviewLinkArrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  header: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 26, paddingTop: 6,
  },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, marginRight: 4, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  noticeCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    marginTop: 22, gap: 8,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 26, marginHorizontal: 20, paddingVertical: 18,
  },
  noticeLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  noticeTitle: { color: theme.colors.bone, fontSize: 15, fontWeight: '700' },
  noticeBody: { color: theme.colors.boneMuted, fontSize: 12.5, lineHeight: 19 },
  copy: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 12, paddingHorizontal: 26, paddingTop: 34, paddingBottom: 28,
  },
  eyebrow: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 26, lineHeight: 33,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  actions: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: 26,
  },
  reviewSection: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 4, marginTop: 32,
    borderTopWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 26, paddingTop: 20,
  },
  reviewLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  reviewCaption: { color: theme.colors.warmGrey, fontSize: 11.5, lineHeight: 16, marginBottom: 6 },
  reviewLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 46,
    borderBottomWidth: 1, borderColor: theme.colors.structureLine,
  },
  reviewLinkPressed: { backgroundColor: theme.colors.surface },
  reviewLinkText: { flex: 1, color: theme.colors.bone, fontSize: 13, fontWeight: '600' },
  reviewLinkArrow: { color: theme.colors.copperBright, fontSize: 15 },
});
