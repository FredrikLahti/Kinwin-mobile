import * as Clipboard from 'expo-clipboard';
import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { RecipientPreviewV2 } from '@/components/v2/recipient-preview';
import { SecondaryButtonV2 } from '@/components/v2/secondary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { describeChallengeRule } from '@/lib/challenge-creation/summary';
import { formatMoney } from '@/lib/home/challenge-summary';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

export default function CreateShareScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { profile, user } = useAuth();
  const onboarding = useOnboarding();
  const {
    behaviorDirection, behaviorText, experienceCategory, invitationMessage,
    measurementMode, recipients, rhythm, setInvitationMessage,
    setInvitationMessageCustomized, stakeAmount,
  } = onboarding;
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [leaveSheetOpen, setLeaveSheetOpen] = useState(false);

  const recipientNames = recipients.map((recipient) => recipient.name.trim()).filter(Boolean);
  const recipientNamesText = recipientNames.join(', ');
  const categoryLabel = experienceCategory ? CATEGORY_LABELS[experienceCategory] : 'shared';
  const stakeLabel = stakeAmount ? formatMoney(stakeAmount * 100, onboarding.currency) : 'the stake';
  const senderName = profile?.displayName?.trim() || user?.email?.split('@')[0] || 'They';
  const ruleSummary = describeChallengeRule({ behaviorDirection, behaviorText, measurementMode, rhythm });

  const updateMessage = (message: string) => {
    setInvitationMessage(message);
    setInvitationMessageCustomized(true);
    setCopied(false);
  };

  const shareMessage = async () => {
    void playSelectionHaptic();
    await Share.share({ message: invitationMessage });
  };

  const copyMessage = async () => {
    void playSelectionHaptic();
    await Clipboard.setStringAsync(invitationMessage);
    setCopied(true);
  };

  const openPreview = () => {
    void playSelectionHaptic();
    setPreviewOpen(true);
  };

  // By the time this screen is reachable, prepareChallengeFromDraft has
  // already created the real server-owned pending commitment (see
  // app/create/review.tsx's runPrepare) — this is no longer a discardable
  // local draft state, so unlike every earlier creation step there is
  // nothing here to lose and no "discard" option to offer. A confirmation
  // still exists so leaving doesn't feel like it silently threw away the
  // not-yet-sent invitation, and to make sure a stray tap can't be
  // mistaken for having created a second challenge.
  const openLeaveSheet = () => {
    void playSelectionHaptic();
    setLeaveSheetOpen(true);
  };

  const confirmLeave = () => {
    void playSelectionHaptic();
    setLeaveSheetOpen(false);
    router.replace('/home' as Href);
  };

  const continueToPayment = () => {
    void playImportantHaptic();
    // The draft's local editable representation has done its job — the
    // server-owned pending commitment (fetched fresh on the next screen) is
    // now the only source of truth for it. The local resumable-creation
    // snapshot was already cleared earlier, at the actual conversion
    // boundary (app/create/review.tsx's runPrepare, right after
    // prepareChallengeFromDraft succeeds) — not here, so a user who closes
    // the app on this screen never leaves one behind.
    onboarding.resetDraft();
    router.replace('/account/pending-commitment' as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.wordmark}>KINWIN</Text>
            <Pressable
              accessibilityHint="Leaves for now and returns to Home. Your challenge is already saved."
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={8}
              onPress={openLeaveSheet}
              style={({ pressed }) => [styles.exitButton, pressed && styles.exitButtonPressed]}
            >
              <Text aria-hidden style={styles.exitIcon}>✕</Text>
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={styles.headline}>Invite {recipientNamesText || 'them'}</Text>
          <Text style={styles.supportingCopy}>Sent from your own messaging app, not by Kinwin.</Text>

          <TextInputV2
            accessibilityLabel="Invitation message"
            maxLength={1000}
            multiline
            onChangeText={updateMessage}
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.oxblood}
            style={styles.messageInput}
            textAlignVertical="top"
            value={invitationMessage}
          />

          <View style={styles.actionRow}>
            <View style={styles.actionHalf}>
              <SecondaryButtonV2 accessibilityHint="Opens your phone's share sheet with this message" label="Share" onPress={() => void shareMessage()} />
            </View>
            <View style={styles.actionHalf}>
              <SecondaryButtonV2 accessibilityHint="Copies this message to your clipboard" label={copied ? 'Copied' : 'Copy message'} onPress={() => void copyMessage()} />
            </View>
          </View>

          <Pressable accessibilityHint="Shows what your recipients will see" accessibilityRole="button" hitSlop={6} onPress={openPreview} style={styles.previewLink}>
            <Text style={styles.previewLinkText}>Preview what they’ll see</Text>
          </Pressable>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButtonV2 accessibilityHint="Continues to payment setup" label="Continue" onPress={continueToPayment} reducedMotion={reducedMotion} />
      </View>

      <BottomSheetV2 onClose={() => setPreviewOpen(false)} reducedMotion={reducedMotion} visible={previewOpen}>
        <RecipientPreviewV2
          categoryLabel={categoryLabel}
          challengeSummary={ruleSummary || 'Challenge details are incomplete.'}
          recipientNamesText={recipientNamesText || 'Your recipients'}
          senderName={senderName}
          stakeLabel={stakeLabel}
        />
      </BottomSheetV2>

      <BottomSheetV2 onClose={() => setLeaveSheetOpen(false)} reducedMotion={reducedMotion} visible={leaveSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Leave for now?</Text>
        <Text style={styles.sheetBody}>
          Your challenge is already saved. You can send this invitation anytime from Home.
        </Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Returns to Home. Your challenge stays saved."
            accessibilityRole="button"
            onPress={confirmLeave}
            style={({ pressed }) => [styles.primarySheetButton, pressed && styles.primarySheetButtonPressed]}
          >
            <Text style={styles.primarySheetButtonLabel}>Go to Home</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Closes this and continues sharing the invitation"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); setLeaveSheetOpen(false); }}
            style={({ pressed }) => [styles.secondarySheetButton, pressed && styles.secondarySheetButtonPressed]}
          >
            <Text style={styles.secondarySheetButtonLabel}>Keep sharing</Text>
          </Pressable>
        </View>
      </BottomSheetV2>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: theme.spacing.large, paddingBottom: theme.spacing.small, gap: 16,
  },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  exitButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginRight: -9, borderRadius: theme.radius.precise,
  },
  exitButtonPressed: { backgroundColor: theme.colors.surface },
  exitIcon: { color: theme.colors.ivoryMuted, fontSize: 16, fontWeight: '700' },
  headline: { color: theme.colors.ivory, fontSize: 26, fontWeight: '700' },
  supportingCopy: { marginTop: -10, color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  messageInput: {
    minHeight: 220, borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, color: theme.colors.ivory, fontSize: 14, lineHeight: 20,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionHalf: { flex: 1 },
  previewLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  previewLinkText: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '700' },
  footer: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 10, paddingBottom: theme.spacing.small,
  },
  sheetTitle: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  sheetBody: { marginTop: 8, color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  sheetActions: { marginTop: 20, gap: 10 },
  primarySheetButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.oxblood,
  },
  primarySheetButtonPressed: { backgroundColor: theme.colors.oxbloodDeep },
  primarySheetButtonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  secondarySheetButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
  },
  secondarySheetButtonPressed: { backgroundColor: theme.colors.surfaceRaised },
  secondarySheetButtonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
});
