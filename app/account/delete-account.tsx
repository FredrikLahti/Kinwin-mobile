// Server-backed account deletion: a preflight eligibility check
// (public.check_account_deletion_eligibility, called directly — safe,
// read-only, auth.uid()-scoped), then an explicit destructive confirmation
// sheet, then the real deletion (supabase/functions/delete-account). See
// docs/ACCOUNT_DELETION_DECISIONS.md for the product decisions this
// implements. Never a one-tap action: reaching this screen at all is
// already one deliberate step past Account's own low-prominence entry
// point, and the destructive action itself requires a second, separate
// confirmation in the sheet below.
import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetV2 } from '@/components/v2/bottom-sheet';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { describeAccountDeletionBlocker } from '@/lib/account-deletion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { checkAccountDeletionEligibility, deleteOwnAccount } from '@/lib/supabase/account-deletion-repository';
import { clearCreationSession, closeCreationSessionGeneration } from '@/lib/challenge-creation/creation-session';
import { creationSessionStorage } from '@/lib/challenge-creation/creation-session-storage';

type Screen =
  | { readonly status: 'checking' }
  | { readonly status: 'blocked'; readonly message: string }
  | { readonly status: 'eligible' }
  | { readonly status: 'deleting' }
  | { readonly status: 'error'; readonly message: string };

export default function DeleteAccountScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { signOut, user } = useAuth();
  const onboarding = useOnboarding();
  const [screen, setScreen] = useState<Screen>({ status: 'checking' });
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);

  const runPreflight = useCallback(async () => {
    setScreen({ status: 'checking' });
    const result = await checkAccountDeletionEligibility();
    if (!result.ok) {
      setScreen({ status: 'error', message: 'Could not check whether your account can be deleted. Check your connection and try again.' });
      return;
    }
    if (!result.eligible) {
      setScreen({ status: 'blocked', message: describeAccountDeletionBlocker(result.reason) });
      return;
    }
    setScreen({ status: 'eligible' });
  }, []);

  useEffect(() => {
    void runPreflight();
  }, [runPreflight]);

  const openConfirmSheet = () => {
    void playImportantHaptic();
    setConfirmSheetOpen(true);
  };

  const confirmDeletion = async () => {
    void playImportantHaptic();
    setConfirmSheetOpen(false);
    setScreen({ status: 'deleting' });
    const result = await deleteOwnAccount();
    if (!result.ok) {
      // A race is possible and expected here, not just a transport
      // failure: the same server-side recheck that makes deletion safe
      // can also legitimately find a newly non-terminal obligation that
      // did not exist at preflight time — show the same blocker copy in
      // that case, not a generic error.
      if (result.kind === 'ineligible') {
        setScreen({ status: 'blocked', message: describeAccountDeletionBlocker(result.reason) });
        return;
      }
      setScreen({ status: 'error', message: result.message });
      return;
    }
    const deletedUserId = user?.id;
    if (deletedUserId) {
      closeCreationSessionGeneration(deletedUserId);
      await clearCreationSession(deletedUserId, creationSessionStorage);
    }
    onboarding.resetDraft();
    // Immediately, not deferred behind a later "Continue" tap: the account
    // (and so the normal server-side revocation signOut would otherwise
    // make) no longer exists, and this screen lives under the signed-in
    // Stack.Protected guard — leaving a dead session in client state while
    // waiting for another tap would be its own small risk for no benefit.
    // 'local' scope skips that now-pointless server round-trip.
    await signOut('local');
    router.replace('/account-deleted' as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.header}>
            {screen.status !== 'deleting' && (
              <Pressable
                accessibilityHint="Returns to Account"
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.back()}
                style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              >
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
            )}
            <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>Delete account</Text>
          </View>

          {screen.status === 'checking' && <Text style={styles.body}>Checking whether your account can be deleted…</Text>}

          {screen.status === 'error' && (
            <>
              <Text style={styles.body}>{screen.message}</Text>
              <Pressable accessibilityHint="Tries the check again" accessibilityRole="button" onPress={() => void runPreflight()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
                <Text style={styles.secondaryButtonLabel}>Try again</Text>
              </Pressable>
            </>
          )}

          {screen.status === 'blocked' && (
            <>
              <Text style={styles.body}>{screen.message}</Text>
              <Pressable accessibilityHint="Returns to Account" accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
                <Text style={styles.secondaryButtonLabel}>Back to Account</Text>
              </Pressable>
            </>
          )}

          {(screen.status === 'eligible' || screen.status === 'deleting') && (
            <>
              <Text style={styles.body}>Deleting your account is permanent and cannot be undone.</Text>
              <Text style={styles.body}>This will delete your challenge history, check-ins, Playbook entries, social activity, and Kin connections. It cannot be undone.</Text>
              <Pressable
                accessibilityHint="Opens a final confirmation before permanently deleting your account"
                accessibilityRole="button"
                disabled={screen.status === 'deleting'}
                onPress={openConfirmSheet}
                style={({ pressed }) => [styles.destructiveButton, pressed && styles.destructiveButtonPressed]}
              >
                <Text style={styles.destructiveButtonLabel}>{screen.status === 'deleting' ? 'Deleting…' : 'Delete account'}</Text>
              </Pressable>
            </>
          )}

        </View>
      </ScrollView>

      <BottomSheetV2 onClose={() => setConfirmSheetOpen(false)} reducedMotion={reducedMotion} visible={confirmSheetOpen}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>Delete your account permanently?</Text>
        <Text style={styles.sheetBody}>
          This permanently deletes your account and cannot be undone. Your challenge history, check-ins, Playbook entries, social activity, and Kin connections will all be deleted.
        </Text>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityHint="Closes this without deleting your account"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); setConfirmSheetOpen(false); }}
            style={({ pressed }) => [styles.secondarySheetButton, pressed && styles.secondarySheetButtonPressed]}
          >
            <Text style={styles.secondarySheetButtonLabel}>Keep my account</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Permanently deletes your account. This cannot be undone."
            accessibilityRole="button"
            onPress={() => void confirmDeletion()}
            style={({ pressed }) => [styles.destructiveSheetButton, pressed && styles.destructiveSheetButtonPressed]}
          >
            <Text style={styles.destructiveSheetButtonLabel}>Delete my account permanently</Text>
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
    paddingHorizontal: theme.spacing.medium, paddingTop: 6, paddingBottom: theme.spacing.large, gap: 16,
  },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  title: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  body: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  secondaryButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
  },
  secondaryButtonPressed: { backgroundColor: theme.colors.surface },
  secondaryButtonLabel: { color: theme.colors.ivoryMuted, fontSize: 14, fontWeight: '700' },
  destructiveButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4,
    borderRadius: theme.radius.controlled, backgroundColor: '#4A1B1B',
  },
  destructiveButtonPressed: { backgroundColor: '#5C2222' },
  destructiveButtonLabel: { color: '#E37D6A', fontSize: 15, fontWeight: '700' },
  sheetTitle: { color: theme.colors.ivory, fontSize: 20, fontWeight: '700' },
  sheetBody: { marginTop: 8, color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  sheetActions: { marginTop: 20, gap: 10 },
  secondarySheetButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
  },
  secondarySheetButtonPressed: { backgroundColor: theme.colors.surfaceRaised },
  secondarySheetButtonLabel: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
  destructiveSheetButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.controlled,
    backgroundColor: '#4A1B1B',
  },
  destructiveSheetButtonPressed: { backgroundColor: '#5C2222' },
  destructiveSheetButtonLabel: { color: '#E37D6A', fontSize: 15, fontWeight: '700' },
});
