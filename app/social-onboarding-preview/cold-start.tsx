import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

/**
 * Journey 1 — a genuine cold-start Kin screen: no approved Kin, no incoming
 * or outgoing requests, no feed activity, no Kinwin username. Explains
 * social value through witnessing real commitments, not chat/activity
 * volume, and treats "Continue solo" as a complete, respected outcome
 * rather than a skipped setup step (docs/SOCIAL_ONBOARDING_UX.md).
 */
export default function ColdStartScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { markContinuedSolo, state } = useSocialOnboarding();
  const isColdStart = state.approvedKin.length === 0 && state.incoming.length === 0 && state.outgoing.length === 0;

  const continueSolo = () => {
    void playSelectionHaptic();
    markContinuedSolo();
  };

  const goAddKin = () => {
    void playImportantHaptic();
    if (!state.identity.username) {
      router.push({ pathname: '/social-onboarding-preview/username', params: { next: 'add-kin' } } as Href);
      return;
    }
    router.push('/social-onboarding-preview/add-kin' as Href);
  };

  const goInvite = () => {
    void playImportantHaptic();
    if (!state.identity.username) {
      router.push({ pathname: '/social-onboarding-preview/username', params: { next: 'invite' } } as Href);
      return;
    }
    router.push('/social-onboarding-preview/invite' as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Returns to the prototype entry"
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
          <Text accessibilityRole="header" style={styles.title}>Kin</Text>
          <Text style={styles.subtitle}>
            {isColdStart
              ? "You don't have any Kin yet — no requests, no feed, no username. That's a normal starting point, not a broken one."
              : "You're partway through — this is what the cold-start screen explains before anyone's added."}
          </Text>
        </View>

        <View style={styles.valueCard}>
          <Text style={styles.valueLabel}>WHAT KIN IS FOR</Text>
          <Text style={styles.valueBody}>
            Kin isn&apos;t a chat or a feed of daily check-ins. It&apos;s a small, private circle
            who see the commitments that actually matter to you — when you start something hard,
            when you slip, and when you follow through.
          </Text>
          <Text style={styles.valueExample}>
            &quot;Alex started: 30 days with no added sugar.&quot;{'\n'}
            &quot;Mia finished the challenge — no misses.&quot;
          </Text>
          <Text style={styles.valueCaption}>
            That&apos;s the kind of thing your Kin will see once you have some — not &quot;checked
            in today.&quot;
          </Text>
        </View>

        {state.continuedSolo ? (
          <View style={styles.soloConfirmedCard}>
            <Text style={styles.soloConfirmedLabel}>CONTINUING SOLO</Text>
            <Text style={styles.soloConfirmedTitle}>Good — Kinwin works fully on your own.</Text>
            <Text style={styles.soloConfirmedBody}>
              Nothing about setting up or completing a challenge requires Kin. You can add someone
              any time from here — there&apos;s no deadline and no reminder nagging you to do it.
            </Text>
            <Pressable
              accessibilityHint="Opens Add Kin whenever you change your mind"
              accessibilityRole="button"
              onPress={goAddKin}
              style={({ pressed }) => [styles.secondaryLink, pressed && styles.secondaryLinkPressed]}
            >
              <Text style={styles.secondaryLinkText}>Add Kin later →</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <AnimatedPrimaryButton
              accessibilityHint="Opens Add Kin to send a Kinship request by exact username"
              label="Add Kin"
              onPress={goAddKin}
              reducedMotion={reducedMotion}
            />
            <Pressable
              accessibilityHint="Opens the invitation-link prototype for someone not on Kinwin yet"
              accessibilityRole="button"
              onPress={goInvite}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            >
              <Text style={styles.secondaryButtonText}>Invite someone</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Confirms you'd rather keep using Kinwin without any Kin for now"
              accessibilityRole="button"
              onPress={continueSolo}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            >
              <Text style={styles.secondaryButtonText}>Continue solo</Text>
            </Pressable>
          </View>
        )}
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
    gap: 8, paddingHorizontal: 26, paddingTop: 10,
  },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 30, lineHeight: 36,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  valueCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, marginHorizontal: 26, marginTop: 24,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 18,
  },
  valueLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  valueBody: { color: theme.colors.bone, fontSize: 14, lineHeight: 21 },
  valueExample: {
    color: theme.colors.boneMuted, fontSize: 13, lineHeight: 20, fontStyle: 'italic',
    borderLeftWidth: 2, borderLeftColor: theme.colors.structureLineStrong, paddingLeft: 10,
  },
  valueCaption: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  actions: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, paddingHorizontal: 26, paddingTop: 28,
  },
  secondaryButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface,
  },
  secondaryButtonPressed: { backgroundColor: theme.colors.surfaceFocused },
  secondaryButtonText: { color: theme.colors.bone, fontSize: 15, fontWeight: '700' },
  soloConfirmedCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, marginHorizontal: 26, marginTop: 28,
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.copperSurface, padding: 18,
  },
  soloConfirmedLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  soloConfirmedTitle: { color: theme.colors.bone, fontSize: 16, fontWeight: '700' },
  soloConfirmedBody: { color: theme.colors.boneMuted, fontSize: 13.5, lineHeight: 20 },
  secondaryLink: { minHeight: 40, justifyContent: 'center', marginTop: 4 },
  secondaryLinkPressed: { opacity: 0.7 },
  secondaryLinkText: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
});
