import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useAuth } from '@/contexts/auth-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const STEPS = [
  'Create a challenge for a habit or behavior you want to change.',
  'Choose who gets the reward if you miss it.',
  'Choose the experience and the stake.',
  'Complete the challenge and you pay nothing.',
  'Miss it and the stake funds their reward.',
  'You do not participate in that reward yourself.',
];

export default function CreateIntroScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { profile, status: authStatus, updateShowChallengeIntro } = useAuth();
  const [ready, setReady] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (authStatus === 'signed_in' && profile?.showChallengeIntro === false) {
      router.replace('/create/goal' as Href);
      return;
    }
    if (authStatus === 'signed_in' && !profile) {
      // Normally resolves almost immediately once the profile loads. If it
      // never does (a transient error, or a profile row genuinely missing
      // fields), fail open after a short wait rather than leaving the
      // screen blank forever — showing the intro unnecessarily is a far
      // smaller problem than a stuck screen.
      const timeout = setTimeout(() => setReady(true), 2500);
      return () => clearTimeout(timeout);
    }
    setReady(true);
  }, [authStatus, profile, router]);

  const toggleDontShowAgain = () => {
    void playSelectionHaptic();
    setDontShowAgain((current) => !current);
  };

  const continueToGoal = () => {
    void playImportantHaptic();
    if (dontShowAgain && authStatus === 'signed_in') void updateShowChallengeIntro(false);
    router.replace('/create/goal' as Href);
  };

  if (!ready) return <View style={styles.blank} />;

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.main}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Returns to Home"
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
          <Text accessibilityRole="header" style={styles.headline}>How it works</Text>
          <View style={styles.steps}>
            {STEPS.map((step, index) => (
              <View key={step} style={styles.step}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          {authStatus === 'signed_in' && (
            <Pressable
              accessibilityHint="Skips this explanation the next time you create a challenge"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontShowAgain }}
              hitSlop={4}
              onPress={toggleDontShowAgain}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkbox, dontShowAgain && styles.checkboxChecked]}>
                {dontShowAgain && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.checkboxCopy}>
                <Text style={styles.checkboxLabel}>Don’t show this again</Text>
                {dontShowAgain && <Text style={styles.checkboxHelper}>You can turn this back on in Account.</Text>}
              </View>
            </Pressable>
          )}
          <PrimaryButtonV2
            accessibilityHint="Starts creating your challenge"
            label="Got it"
            onPress={continueToGoal}
            reducedMotion={reducedMotion}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: theme.colors.ink },
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  content: {
    flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.medium, paddingTop: theme.spacing.large, paddingBottom: theme.spacing.small,
  },
  main: { gap: 28 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.crimsonBright, fontSize: 30, fontWeight: '300', lineHeight: 33 },
  wordmark: { color: theme.colors.warmGrey, fontSize: 12, fontWeight: '700', letterSpacing: 4 },
  headline: { color: theme.colors.ivory, fontSize: 30, fontWeight: '700' },
  steps: { gap: 18 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepNumber: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.oxblood,
    color: theme.colors.ivory, fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 24,
  },
  stepText: { flex: 1, color: theme.colors.ivory, fontSize: 18, fontWeight: '600', lineHeight: 25, paddingTop: 2 },
  footer: { gap: 16 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 4,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface,
  },
  checkboxChecked: { borderColor: theme.colors.oxblood, backgroundColor: theme.colors.oxbloodDeep },
  checkmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '800' },
  checkboxCopy: { flex: 1 },
  checkboxLabel: { color: theme.colors.ivoryMuted, fontSize: 14, fontWeight: '600' },
  checkboxHelper: { marginTop: 4, color: theme.colors.warmGrey, fontSize: 12, lineHeight: 16 },
});
