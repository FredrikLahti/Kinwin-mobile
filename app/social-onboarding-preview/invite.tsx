import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { KinAvatar } from '@/components/social/kin-avatar';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useSocialOnboarding } from '@/contexts/social-onboarding-context';
import { FREDRIK } from '@/fixtures/social/onboarding-directory';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

/**
 * Journey 4 — inviting someone without Kinwin. No real deep link, OS share
 * sheet, SMS, email, or delivery — the link and message are illustrative
 * text, and "Copy link" only flips a local confirmation label for a moment.
 *
 * Accepting an invitation creates the mutual Kinship directly (see
 * `lib/social/invitation.ts`'s `acceptInvitation`) — the sender already
 * expressed intent by issuing the invite, so no separate Add Kin step is
 * needed on either side. Challenge access is still never automatic.
 */
export default function InviteScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { sendInvitation, state } = useSocialOnboarding();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!state.invitation && state.identity.username) sendInvitation();
  }, [sendInvitation, state.identity.username, state.invitation]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!state.identity.username) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.gateWrap}>
          <PrototypeTag />
          <Text accessibilityRole="header" style={styles.gateTitle}>You need a Kinwin username first</Text>
          <Text style={styles.gateBody}>
            An invitation shows who it&apos;s from, so Kinwin asks for a username before you can
            send one.
          </Text>
          <AnimatedPrimaryButton
            accessibilityHint="Opens the username setup screen, then returns here"
            label="Choose a username"
            onPress={() => {
              void playImportantHaptic();
              router.push({ pathname: '/social-onboarding-preview/username', params: { next: 'invite' } } as Href);
            }}
            reducedMotion={reducedMotion}
          />
        </View>
      </SafeAreaView>
    );
  }

  const invitation = state.invitation;

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
          <Text accessibilityRole="header" style={styles.title}>Invite someone to Kinwin</Text>
          <Text style={styles.subtitle}>
            For someone who isn&apos;t on Kinwin yet. This is a link and a message — nothing is
            actually sent from this prototype.
          </Text>
        </View>

        <View style={styles.senderRow}>
          <KinAvatar initials={state.identity.username.slice(0, 2).toUpperCase()} />
          <View>
            <Text style={styles.senderLabel}>FROM</Text>
            <Text style={styles.senderName}>@{state.identity.username}</Text>
          </View>
        </View>

        {invitation && (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>INVITATION LINK</Text>
              <View style={styles.linkCard}>
                <Text numberOfLines={1} style={styles.linkText}>{invitation.link}</Text>
              </View>
              <Pressable
                accessibilityHint="Copies the invitation link — simulated, nothing goes to a real clipboard"
                accessibilityRole="button"
                onPress={() => { void playSelectionHaptic(); setCopied(true); }}
                style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
              >
                <Text style={styles.copyButtonText}>{copied ? 'Copied ✓' : 'Copy link'}</Text>
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>SUGGESTED MESSAGE</Text>
              <View style={styles.messageCard}>
                <Text style={styles.messageText}>{invitation.message}</Text>
              </View>
            </View>
          </>
        )}

        <View style={styles.grantsCard}>
          <Text style={styles.grantsLabel}>WHAT THIS INVITE DOES AND DOESN&apos;T DO</Text>
          <Bullet text="They see who invited them and choose to create an account — nothing is created for them until they do." />
          <Bullet text="The invitation never reveals any challenge details, even if you have one active." />
          <Bullet text="Accepting creates the mutual Kinship directly — no separate Add Kin step on either side, since sending the invitation already expressed your intent to be Kin." />
          <Bullet text="Even once you're Kin, they see no old, current, or future challenge until you explicitly include them in that challenge's audience." />
        </View>

        <RecipientPreview />

        <View style={styles.unresolvedCard}>
          <Text style={styles.unresolvedLabel}>NOT DECIDED YET</Text>
          <Text style={styles.unresolvedBody}>
            Whether this link expires, whether it can be reused by more than one person, and what
            happens if it&apos;s opened by someone other than the intended recipient are all
            unresolved — see docs/SOCIAL_ONBOARDING_UX.md.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A self-contained demonstration of the *other* side of this flow — what an
 * invited person sees and does, using a fixed example inviter (Fredrik)
 * rather than the current session's own identity. Accept/decline here are
 * real, working transitions against the same `approvedKin` state every
 * other screen reads, not a cosmetic mockup.
 */
function RecipientPreview() {
  const { acceptInvitationFrom, state } = useSocialOnboarding();
  const [declined, setDeclined] = useState(false);
  const isKin = state.approvedKin.some((kin) => kin.id === FREDRIK.id);

  return (
    <View style={styles.recipientSection}>
      <Text style={styles.recipientLabel}>PREVIEW — WHAT AN INVITED PERSON SEES</Text>
      <Text style={styles.recipientCaption}>
        A worked example with a fixed inviter, so you can see the other side of this same flow.
      </Text>

      <View style={styles.recipientCard}>
        <View style={styles.senderRow}>
          <KinAvatar initials={FREDRIK.initials} />
          <Text style={styles.recipientHeadline}>{FREDRIK.displayName} invited you to become Kin.</Text>
        </View>

        {isKin ? (
          <Text style={styles.recipientResultText}>
            You and {FREDRIK.displayName} are now Kin. They still can&apos;t see any challenge —
            old, current, or future — until you explicitly include them in one&apos;s audience.
          </Text>
        ) : declined ? (
          <Text style={styles.recipientResultText}>Declined. No Kinship was created.</Text>
        ) : (
          <View style={styles.recipientActions}>
            <Pressable
              accessibilityHint={`Accepts ${FREDRIK.displayName}'s invitation and becomes Kin`}
              accessibilityRole="button"
              onPress={() => { void playImportantHaptic(); acceptInvitationFrom(FREDRIK); }}
              style={({ pressed }) => [styles.recipientAcceptButton, pressed && styles.recipientAcceptButtonPressed]}
            >
              <Text style={styles.recipientAcceptButtonText}>Accept — become Kin</Text>
            </Pressable>
            <Pressable
              accessibilityHint={`Declines ${FREDRIK.displayName}'s invitation`}
              accessibilityRole="button"
              onPress={() => { void playSelectionHaptic(); setDeclined(true); }}
              style={({ pressed }) => [styles.recipientDeclineButton, pressed && styles.recipientDeclineButtonPressed]}
            >
              <Text style={styles.recipientDeclineButtonText}>Decline</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  gateTitle: {
    color: theme.colors.bone, textAlign: 'center',
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 22, lineHeight: 28,
  },
  gateBody: { color: theme.colors.boneMuted, textAlign: 'center', fontSize: 13.5, lineHeight: 20, maxWidth: 320 },
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
    fontSize: 24, lineHeight: 30,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  senderRow: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 22, paddingTop: 20,
  },
  senderLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  senderName: { color: theme.colors.bone, fontSize: 14, fontWeight: '700', marginTop: 2 },
  field: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, paddingHorizontal: 22, paddingTop: 22,
  },
  label: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  linkCard: {
    minHeight: 48, justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14,
  },
  linkText: { color: theme.colors.copperBright, fontSize: 13.5, fontWeight: '600' },
  copyButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.surface,
  },
  copyButtonPressed: { backgroundColor: theme.colors.surfaceFocused },
  copyButtonText: { color: theme.colors.bone, fontSize: 13.5, fontWeight: '700' },
  messageCard: {
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 14,
  },
  messageText: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 20 },
  grantsCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, marginHorizontal: 22, marginTop: 28,
    borderTopWidth: 1, borderColor: theme.colors.structureLine, paddingTop: 20,
  },
  grantsLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35, marginBottom: 4 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.copperBright, marginTop: 7 },
  bulletText: { flex: 1, color: theme.colors.boneMuted, fontSize: 12.5, lineHeight: 19 },
  recipientSection: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, marginHorizontal: 22, marginTop: 26,
    borderTopWidth: 1, borderColor: theme.colors.structureLine, paddingTop: 20,
  },
  recipientLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  recipientCaption: { color: theme.colors.warmGrey, fontSize: 11.5, lineHeight: 16 },
  recipientCard: {
    gap: 14, marginTop: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surfaceRaised, padding: 16,
  },
  recipientHeadline: { flex: 1, color: theme.colors.bone, fontSize: 14.5, fontWeight: '700', lineHeight: 20 },
  recipientResultText: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  recipientActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  recipientAcceptButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.copperSurface, paddingHorizontal: 14,
  },
  recipientAcceptButtonPressed: { opacity: 0.85 },
  recipientAcceptButtonText: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
  recipientDeclineButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  recipientDeclineButtonPressed: { opacity: 0.7 },
  recipientDeclineButtonText: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '700' },
  unresolvedCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 6, marginHorizontal: 22, marginTop: 24,
    borderTopWidth: 1, borderColor: theme.colors.structureLine, paddingTop: 16,
  },
  unresolvedLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  unresolvedBody: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
});
