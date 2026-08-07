import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { PrototypeTag } from '@/components/social/prototype-tag';
import { kinwinTheme as theme } from '@/constants/theme';
import { useChallengeUxPreview } from '@/contexts/challenge-ux-preview-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playSelectionHaptic } from '@/lib/haptics';

const ACTIONABLE_NEXT_ACTIONS = new Set(['check_in', 'late_check_in', 'stop_final_attestation']);

/**
 * The primary active-challenge surface. Answers, with strong hierarchy: what
 * did I promise, what matters right now, do I need to do anything right now —
 * see docs/CHALLENGE_CHECKIN_UX.md's "Active challenge hierarchy" section.
 */
export default function ChallengeUxPreviewHome() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const preview = useChallengeUxPreview();
  const { scenario, viewModel } = preview;

  const goToCheckIn = () => { void playSelectionHaptic(); router.push('/challenge-ux-preview/check-in' as Href); };
  const goToResult = () => { void playSelectionHaptic(); router.push('/challenge-ux-preview/result' as Href); };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Returns to the state picker"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/challenge-ux-preview' as Href)}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text aria-hidden style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.wordmark}>KINWIN</Text>
        </View>

        <PrototypeTag />

        <Text style={styles.eyebrow}>YOUR REASON</Text>
        <Text style={styles.goal}>{viewModel.goal}</Text>

        <Text style={styles.promiseLabel}>YOUR PROMISE</Text>
        <Text style={styles.promise}>{viewModel.promise}</Text>

        <Section label={viewModel.currentPeriodHeadline.toUpperCase()}>
          <Text style={styles.sectionTitle}>{copyForStatus(viewModel.currentPeriodStatus)}</Text>
          <Text style={styles.body}>{viewModel.currentPeriodCopy}</Text>
          {viewModel.nextAction.detail !== '' && <Text style={styles.detail}>{viewModel.nextAction.detail}</Text>}
          {ACTIONABLE_NEXT_ACTIONS.has(viewModel.nextAction.kind) && (
            <AnimatedPrimaryButton
              accessibilityHint="Opens the check-in for this period"
              label={viewModel.nextAction.label}
              onPress={goToCheckIn}
              reducedMotion={reducedMotion}
            />
          )}
          {viewModel.direction === 'stop' && viewModel.currentPeriodStatus.kind === 'calm' && (
            <Pressable
              accessibilityHint="Opens a low-emphasis way to record a lapse if one happened"
              accessibilityRole="button"
              onPress={goToCheckIn}
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>Report a lapse</Text>
            </Pressable>
          )}
        </Section>

        {viewModel.direction === 'stop'
          ? viewModel.stopLapseCorrectionTarget !== null && (
            <Pressable
              accessibilityHint="Opens a low-emphasis way to correct an earlier lapse reported by accident"
              accessibilityRole="button"
              onPress={goToCheckIn}
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>Correct an earlier entry</Text>
            </Pressable>
          )
          : viewModel.correction.available && (
            <Pressable
              accessibilityHint="Opens a low-emphasis way to change what you already reported"
              accessibilityRole="button"
              onPress={goToCheckIn}
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>Change this check-in</Text>
            </Pressable>
          )}

        <Section label="PROGRESS">
          {viewModel.progress.progressSoFarLabel && <Text style={styles.body}>{viewModel.progress.progressSoFarLabel}</Text>}
          {viewModel.progress.streakLabel && <Text style={styles.streak}>{viewModel.progress.streakLabel}</Text>}
          <Text style={styles.aggregate}>{viewModel.progress.requirementLabel}</Text>
        </Section>

        <Section label="TIME REMAINING">
          <Text style={styles.body}>{viewModel.timeRemaining}</Text>
        </Section>

        <Section label="IF THE PROMISE ISN'T KEPT">
          <Text style={styles.body}>{viewModel.consequenceSummary}</Text>
        </Section>

        {viewModel.finalResult && (
          <Pressable
            accessibilityHint="Opens the final challenge result"
            accessibilityRole="button"
            onPress={goToResult}
            style={styles.textButton}
          >
            <Text style={styles.textButtonText}>View final result →</Text>
          </Pressable>
        )}

        <Text style={styles.scenarioId}>Fixture: {scenario.id}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function copyForStatus(status: { kind: string }): string {
  switch (status.kind) {
    case 'upcoming': return 'Not started yet';
    case 'calm': return "You're up to date";
    case 'check_in_due': return 'Not recorded yet';
    case 'reported': return 'Recorded';
    case 'late_check_in': return 'Check-in still open';
    case 'late_reported': return 'Recorded late';
    case 'missed': return 'Not met';
    case 'closed_satisfied': return 'Complete';
    case 'closed_not_satisfied': return 'Not met';
    case 'stop_lapse_on_record': return 'Lapse on record';
    case 'stop_final_attestation_due': return 'Final answer due';
    default: return 'Needs attention';
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.eyebrow}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  header: {
    width: '100%', maxWidth: 600, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 6,
  },
  backButton: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, lineHeight: 35 },
  pressed: { opacity: 0.65 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  eyebrow: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginTop: 12 },
  goal: {
    width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24,
    color: theme.colors.boneMuted, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 22, lineHeight: 28, marginTop: 2,
  },
  promiseLabel: {
    width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24,
    color: '#7D8589', fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginTop: 16,
  },
  promise: {
    width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24,
    color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 30, lineHeight: 36, marginTop: 2,
  },
  section: {
    width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24,
    borderTopWidth: 1, borderColor: theme.colors.structureLineStrong, paddingTop: 12, gap: 10, marginTop: 18,
  },
  sectionTitle: {
    color: theme.colors.bone, fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 24, lineHeight: 30,
  },
  body: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  detail: { color: theme.colors.warmGrey, fontSize: 13, lineHeight: 19 },
  streak: { color: theme.colors.copperBright, fontSize: 13, fontWeight: '700' },
  aggregate: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  textButton: {
    width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24,
    minHeight: 40, justifyContent: 'center', marginTop: 4,
  },
  textButtonText: { color: theme.colors.copperBright, fontWeight: '700', fontSize: 13 },
  scenarioId: {
    width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24,
    color: theme.colors.warmGrey, fontSize: 10, marginTop: 28,
  },
});
