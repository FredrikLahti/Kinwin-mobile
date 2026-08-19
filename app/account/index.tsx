import { Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledFieldV2 } from '@/components/v2/labeled-field';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { ResumeCreationSheetV2 } from '@/components/v2/resume-creation-sheet';
import { SegmentedControlV2 } from '@/components/v2/segmented-control';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { SUPPORTED_CURRENCIES, SupportedCurrency } from '@/domain/challenge/currency';
import { useCreateChallengeEntry } from '@/hooks/use-create-challenge-entry';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { resolveDefaultCurrency } from '@/lib/challenge-creation/currency-default';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { readSupportConfig } from '@/lib/support/config';
import { fetchLatestEditableDraft } from '@/lib/supabase/challenge-draft-repository';
import { fetchPendingCommitment } from '@/lib/supabase/challenge-repository';

const CURRENCY_OPTIONS: readonly { label: string; value: SupportedCurrency }[] =
  SUPPORTED_CURRENCIES.map((value) => ({ label: value, value: value as SupportedCurrency }));

type DraftLookup = { status: 'loading' } | { status: 'none' } | { status: 'found' } | { status: 'error'; message: string };

export default function AccountScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { profile, signOut, updateDisplayName, updatePreferredCurrency, updateShowChallengeIntro, user } = useAuth();
  const onboarding = useOnboarding();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [draftLookup, setDraftLookup] = useState<DraftLookup>({ status: 'loading' });
  // Only one pending commitment is ever allowed per owner (enforced
  // server-side too); the Challenge setup card checks this so it can steer
  // to the existing one instead of letting prepare_challenge_from_draft
  // reject a second one later, deeper into onboarding.
  const [hasPendingCommitment, setHasPendingCommitment] = useState(false);
  const createChallengeEntry = useCreateChallengeEntry();
  const { refreshResumableSession } = createChallengeEntry;
  // Re-checked on every return to Account, not just once on mount — a
  // resumable local session can be created or cleared entirely inside
  // app/create/*, and this screen needs the current answer before the
  // Challenge setup card can decide whether to offer Continue/Discard.
  // Without this, navigating back here after creating unfinished progress
  // elsewhere would silently offer the stale "no session" behavior — the
  // same silent-discard risk this hook exists to prevent.
  useFocusEffect(useCallback(() => { refreshResumableSession(); }, [refreshResumableSession]));

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '');
  }, [profile?.displayName]);

  const loadDraftLookup = useCallback(async () => {
    if (!user) return;
    setDraftLookup({ status: 'loading' });
    const result = await fetchLatestEditableDraft(user.id);
    if (!result.ok) {
      setDraftLookup({ status: 'error', message: 'Could not check for an unfinished challenge. Check your connection.' });
      return;
    }
    setDraftLookup(result.draftId ? { status: 'found' } : { status: 'none' });
  }, [user]);

  useEffect(() => {
    void loadDraftLookup();
  }, [loadDraftLookup]);

  const loadPendingCommitmentFlag = useCallback(async () => {
    if (!user) return;
    const result = await fetchPendingCommitment(user.id);
    setHasPendingCommitment(result.ok && result.commitment !== null);
  }, [user]);

  useEffect(() => {
    void loadPendingCommitmentFlag();
  }, [loadPendingCommitmentFlag]);

  const saveName = async () => {
    void playSelectionHaptic();
    setSavingName(true);
    setNameSaved(false);
    const result = await updateDisplayName(displayName);
    setSavingName(false);
    if (result.ok) setNameSaved(true);
  };

  const continueDraft = async () => {
    if (!user) return;
    void playImportantHaptic();
    const result = await fetchLatestEditableDraft(user.id);
    if (result.ok && result.draftId && result.data) {
      onboarding.loadDraftData(result.data, result.draftId);
      router.push('/create/review' as Href);
    }
  };

  const openPendingCommitment = () => {
    void playSelectionHaptic();
    router.push('/account/pending-commitment' as Href);
  };

  // Shares its decision and confirmation UX with Home's "+ Create challenge"
  // (hooks/use-create-challenge-entry.ts): pending commitment still wins
  // outright, and a resumable local creation session is offered a
  // Continue/Start-new choice here too, instead of being silently
  // discarded — the same explicit destructive confirmation Home requires.
  const startNew = () => createChallengeEntry.requestCreateChallenge(hasPendingCommitment);

  const toggleShowIntro = async () => {
    void playSelectionHaptic();
    await updateShowChallengeIntro(!(profile?.showChallengeIntro ?? true));
  };

  // Display-only default when no explicit preference has been saved yet —
  // never persisted until the user actually taps an option. Never touches
  // any existing draft's or challenge's own currency (see
  // docs/PRODUCT_DECISIONS.md) — this only changes what future fresh
  // drafts default to.
  const preferredCurrency = profile?.preferredCurrency ?? resolveDefaultCurrency(null);
  const selectPreferredCurrency = (currency: SupportedCurrency) => {
    void playSelectionHaptic();
    void updatePreferredCurrency(currency);
  };

  const handleSignOut = async () => {
    void playSelectionHaptic();
    await signOut();
    router.replace('/' as Href);
  };

  const supportConfig = readSupportConfig();
  const contactSupport = () => {
    if (!supportConfig) return;
    void playSelectionHaptic();
    void Linking.openURL(`mailto:${supportConfig.email}?subject=${encodeURIComponent('Kinwin support')}`);
  };

  // draftLookup starts 'loading' on every mount (see loadDraftLookup) — it
  // must read as a distinct, neutral state, not silently fall through to
  // "none," or a user with a real saved draft could be told there is
  // nothing unfinished and start a redundant parallel challenge before the
  // real lookup even resolves.
  const challengeSetupStatus = hasPendingCommitment
    ? 'Your challenge is ready to activate.'
    : draftLookup.status === 'loading'
      ? 'Checking for an unfinished challenge…'
      : draftLookup.status === 'found'
        ? 'You have a challenge ready to review.'
        : createChallengeEntry.hasResumableSession
          ? 'You have an unfinished challenge.'
          : 'No unfinished challenge right now.';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
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
            <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>Account</Text>
          </View>

          <View style={styles.card}>
            <Text numberOfLines={1} style={styles.email}>{user?.email}</Text>
            <LabeledFieldV2 label="Display name (optional)">
              <TextInputV2
                accessibilityLabel="Display name"
                onChangeText={(value) => { setDisplayName(value); setNameSaved(false); }}
                placeholder="What should we call you?"
                placeholderTextColor={theme.colors.warmGrey}
                selectionColor={theme.colors.oxblood}
                style={styles.input}
                value={displayName}
              />
            </LabeledFieldV2>
            <Pressable
              accessibilityHint="Saves your display name"
              accessibilityRole="button"
              disabled={savingName}
              onPress={() => void saveName()}
              style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
            >
              <Text style={styles.textButtonLabel}>{savingName ? 'Saving…' : nameSaved ? 'Saved' : 'Save name'}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>CHALLENGE SETUP</Text>
            {!hasPendingCommitment && draftLookup.status === 'error' ? (
              <Text style={styles.error}>{draftLookup.message}</Text>
            ) : (
              <Text style={styles.cardBody}>{challengeSetupStatus}</Text>
            )}

            {hasPendingCommitment && (
              <PrimaryButtonV2
                accessibilityHint="Opens your pending commitment to finish setup"
                label="Continue setup"
                onPress={openPendingCommitment}
                reducedMotion={reducedMotion}
              />
            )}

            {!hasPendingCommitment && draftLookup.status === 'found' && (
              <PrimaryButtonV2
                accessibilityHint="Restores your saved challenge for review"
                label="Continue"
                onPress={() => void continueDraft()}
                reducedMotion={reducedMotion}
              />
            )}

            {!hasPendingCommitment && draftLookup.status !== 'loading' && (
              <Pressable
                accessibilityHint={
                  createChallengeEntry.hasResumableSession
                    ? 'Offers to continue your unfinished challenge or start a new one'
                    : 'Starts a new challenge'
                }
                accessibilityRole="button"
                onPress={startNew}
                style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
              >
                <Text style={styles.textButtonLabel}>
                  {createChallengeEntry.hasResumableSession ? 'Continue or start new' : 'Start a challenge'}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>PREFERENCES</Text>
            <Pressable
              accessibilityHint="Toggles whether How Kinwin works is shown before creating a challenge"
              accessibilityRole="switch"
              accessibilityState={{ checked: profile?.showChallengeIntro ?? true }}
              onPress={() => void toggleShowIntro()}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowLabel}>Show &quot;How Kinwin works&quot; before creating a challenge</Text>
              <Text style={styles.rowValue}>{(profile?.showChallengeIntro ?? true) ? 'On' : 'Off'}</Text>
            </Pressable>
            <View style={styles.currencyRow}>
              <Text style={styles.rowLabel}>Preferred currency</Text>
              <SegmentedControlV2 onChange={selectPreferredCurrency} options={CURRENCY_OPTIONS} value={preferredCurrency} />
              <Text style={styles.currencyHelper}>Used as the default for new challenges. Does not change any challenge you already have.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>SUPPORT &amp; LEGAL</Text>
            {supportConfig ? (
              <Pressable
                accessibilityHint={`Opens your email app to contact Kinwin support at ${supportConfig.email}`}
                accessibilityRole="button"
                onPress={contactSupport}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={styles.rowLabel}>Contact Kinwin</Text>
              </Pressable>
            ) : (
              <Text style={styles.cardBody}>Support contact is not configured in this build yet.</Text>
            )}
            <Pressable
              accessibilityHint="Opens Kinwin's privacy page"
              accessibilityRole="button"
              onPress={() => { void playSelectionHaptic(); router.push('/legal/privacy' as Href); }}
              style={({ pressed }) => [styles.row, styles.rowLast, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowLabel}>Privacy</Text>
            </Pressable>
            {/* No Terms row: Kinwin has no custom Terms of Service yet.
                Apple's standard EULA applies to App Store submissions by
                default when no custom EULA is supplied, so this is not a
                generic App Store blocker; whether Kinwin needs its own
                Terms before real-money public launch is a separate legal/
                business question, not resolved here. See
                docs/LAUNCH_READINESS.md. */}
          </View>

          <Pressable
            accessibilityHint="Signs out of your Kinwin account"
            accessibilityRole="button"
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutButtonPressed]}
          >
            <Text style={styles.signOutLabel}>Sign out</Text>
          </Pressable>

          <Pressable
            accessibilityHint="Opens the option to permanently delete your Kinwin account"
            accessibilityRole="button"
            onPress={() => { void playSelectionHaptic(); router.push('/account/delete-account' as Href); }}
            style={({ pressed }) => [styles.deleteAccountLink, pressed && styles.deleteAccountLinkPressed]}
          >
            <Text style={styles.deleteAccountLabel}>Delete account</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ResumeCreationSheetV2
        confirmingDiscard={createChallengeEntry.confirmingDiscard}
        discardFailed={createChallengeEntry.discardFailed}
        discardingSession={createChallengeEntry.discardingSession}
        onCancelDiscard={createChallengeEntry.cancelDiscardConfirmation}
        onClose={createChallengeEntry.closeResumeSheet}
        onConfirmDiscard={() => void createChallengeEntry.confirmDiscardResumableSession()}
        onContinue={createChallengeEntry.continueResumableSession}
        onRequestDiscard={createChallengeEntry.requestDiscardConfirmation}
        reducedMotion={reducedMotion}
        resumableSummary={createChallengeEntry.resumableSummary}
        visible={createChallengeEntry.resumeSheetOpen}
      />
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
  card: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, padding: theme.spacing.medium, gap: 12,
  },
  cardLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  cardBody: { color: theme.colors.ivoryMuted, fontSize: 13, lineHeight: 19 },
  email: { color: theme.colors.ivory, fontSize: 17, fontWeight: '700' },
  input: { color: theme.colors.ivory, fontSize: 15, fontWeight: '600', paddingHorizontal: 0, paddingVertical: 0 },
  error: { color: '#E37D6A', fontSize: 13, lineHeight: 19 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  textButtonPressed: { opacity: 0.7 },
  textButtonLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '700' },
  row: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, paddingBottom: 12,
  },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  rowPressed: { opacity: 0.7 },
  rowLabel: { flex: 1, color: theme.colors.ivory, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  rowValue: { color: theme.colors.ivoryMuted, fontSize: 13, fontWeight: '700' },
  currencyRow: { gap: 8 },
  currencyHelper: { color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  signOutButton: {
    minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
  },
  signOutButtonPressed: { backgroundColor: theme.colors.surface },
  signOutLabel: { color: theme.colors.ivoryMuted, fontSize: 14, fontWeight: '700' },
  deleteAccountLink: { minHeight: 32, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  deleteAccountLinkPressed: { opacity: 0.7 },
  deleteAccountLabel: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '600' },
});
