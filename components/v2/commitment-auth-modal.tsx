import { Href, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthFormV2 } from '@/components/v2/auth-form';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { playSelectionHaptic } from '@/lib/haptics';

type CommitmentAuthModalV2Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * The account-gate at the final Review moment (Section 3-7 of the
 * commitment-home-ux package): a real modal, not a route, so the Review
 * screen (and the OnboardingContext draft it reads from) never unmounts
 * while the user signs in or up. Closing it — by the X, the backdrop, or a
 * successful auth — always returns the user to the exact same Review
 * screen with their draft intact; it never itself saves, prepares, or
 * activates anything. Review's own "Confirm commitment" button remains the
 * only thing that does that, and only after this modal is closed.
 */
export function CommitmentAuthModalV2({ visible, onClose }: CommitmentAuthModalV2Props) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (visible && status === 'signed_in') onClose();
  }, [onClose, status, visible]);

  const openForgotPassword = () => {
    onClose();
    router.push('/auth/forgot-password' as Href);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityHint="Closes this and returns to your commitment"
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrapper}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.eyebrow}>Save this commitment to your account</Text>
              <Pressable
                accessibilityHint="Closes this and returns to your commitment, which stays exactly as you left it"
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => { void playSelectionHaptic(); onClose(); }}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
              >
                <Text aria-hidden style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.contextCopy}>
              Nothing is charged yet. You&apos;ll confirm the commitment itself on the next screen, after this.
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <AuthFormV2
                onForgotPassword={openForgotPassword}
                signUpSupportingCopy="Email and password for now."
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 6, 7, 0.72)' },
  sheetWrapper: { maxHeight: '92%' },
  sheet: {
    backgroundColor: theme.colors.ink,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    borderBottomWidth: 0,
    paddingHorizontal: theme.spacing.medium,
    paddingTop: theme.spacing.medium,
    paddingBottom: theme.spacing.large,
    gap: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: {
    flex: 1, color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '700',
    letterSpacing: 0.3, textTransform: 'uppercase', paddingTop: 6,
  },
  closeButton: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.radius.precise, marginRight: -6, marginTop: -6,
  },
  closeButtonPressed: { backgroundColor: theme.colors.surface },
  closeIcon: { color: theme.colors.ivoryMuted, fontSize: 15, fontWeight: '600' },
  contextCopy: { color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
});
