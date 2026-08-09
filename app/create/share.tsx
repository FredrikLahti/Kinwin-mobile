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

  const recipientNames = recipients.map((recipient) => recipient.name.trim()).filter(Boolean);
  const recipientNamesText = recipientNames.join(', ');
  const categoryLabel = experienceCategory ? CATEGORY_LABELS[experienceCategory] : 'shared';
  const stakeLabel = stakeAmount ? `$${stakeAmount.toLocaleString('en-US')}` : 'the stake';
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

  const continueToPayment = () => {
    void playImportantHaptic();
    // The draft's local editable representation has done its job — the
    // server-owned pending commitment (fetched fresh on the next screen) is
    // now the only source of truth for it.
    onboarding.resetDraft();
    router.replace('/account/pending-commitment' as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.wordmark}>KINWIN</Text>
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
  wordmark: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
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
});
