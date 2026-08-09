import * as Clipboard from 'expo-clipboard';
import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { SecondaryButtonV2 } from '@/components/v2/secondary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

export default function CreateShareScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const { invitationMessage, recipients, setInvitationMessage, setInvitationMessageCustomized } = onboarding;
  const [copied, setCopied] = useState(false);

  const recipientNamesText = recipients.map((recipient) => recipient.name.trim()).filter(Boolean).join(', ');

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

          <TextInput
            accessibilityLabel="Invitation message"
            maxLength={1000}
            multiline
            onChangeText={updateMessage}
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.crimsonBright}
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
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButtonV2 accessibilityHint="Continues to payment setup" label="Continue" onPress={continueToPayment} reducedMotion={reducedMotion} />
      </View>
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
  footer: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingTop: 10, paddingBottom: theme.spacing.small,
  },
});
