import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useChallengeUxPreview } from '@/contexts/challenge-ux-preview-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * The final challenge result. `finalResult` comes straight from
 * `evaluateChallenge` (via the view model) — this screen only formats it,
 * see docs/CHALLENGE_CHECKIN_UX.md's "Final challenge result" section.
 */
export default function ChallengeUxPreviewResult() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const preview = useChallengeUxPreview();
  const { viewModel } = preview;
  const result = viewModel.finalResult;

  const backToHub = () => router.push('/challenge-ux-preview' as Href);

  if (!result) {
    return (
      <Shell>
        <Text style={styles.eyebrow}>FINAL RESULT</Text>
        <Text accessibilityRole="header" style={styles.headline}>This challenge isn&rsquo;t finished yet.</Text>
        <Text style={styles.body}>A result only appears once every period has closed and its reporting window has passed.</Text>
        <AnimatedPrimaryButton accessibilityHint="Returns to the state picker" label="Back to states" onPress={backToHub} reducedMotion={reducedMotion} />
      </Shell>
    );
  }

  if (result.status === 'success') {
    return (
      <Shell>
        <Text style={styles.eyebrow}>FINAL RESULT</Text>
        <Text accessibilityRole="header" style={styles.headline}>Promise kept.</Text>
        <Text style={styles.body}>{viewModel.promise}</Text>
        <Text style={styles.body}>
          {viewModel.progress.periodsMet} of {viewModel.progress.periodsTotal} periods met the promise. No consequence is owed.
        </Text>
        <AnimatedPrimaryButton accessibilityHint="Returns to the state picker" label="Back to states" onPress={backToHub} reducedMotion={reducedMotion} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Text style={styles.eyebrow}>FINAL RESULT</Text>
      <Text accessibilityRole="header" style={styles.headline}>The promise wasn&rsquo;t kept.</Text>
      <Text style={styles.body}>{viewModel.promise}</Text>
      <Text style={styles.body}>
        {viewModel.progress.periodsMet} of {viewModel.progress.periodsTotal} periods met the promise.
      </Text>
      <View style={styles.consequenceCard}>
        <Text style={styles.consequenceLabel}>NEXT LIFECYCLE STAGE</Text>
        <Text style={styles.consequenceBody}>Consequence processing comes next. {viewModel.consequenceSummary}</Text>
      </View>
      <AnimatedPrimaryButton accessibilityHint="Returns to the state picker" label="Back to states" onPress={backToHub} reducedMotion={reducedMotion} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <PrototypeTag />
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24, gap: 16 },
  eyebrow: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: { color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }), fontSize: 38, lineHeight: 44 },
  body: { color: theme.colors.boneMuted, fontSize: 15, lineHeight: 22 },
  consequenceCard: {
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, padding: 16, gap: 6,
  },
  consequenceLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  consequenceBody: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
});
