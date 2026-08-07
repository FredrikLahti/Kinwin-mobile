import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kinwinTheme as theme } from '@/constants/theme';
import { useChallengeUxPreview } from '@/contexts/challenge-ux-preview-context';
import { CHALLENGE_UX_SCENARIOS, ChallengeUxScenario } from '@/fixtures/challenge-ux-preview/scenarios';
import { playSelectionHaptic } from '@/lib/haptics';

const GROUPS: readonly ChallengeUxScenario['menuGroup'][] = ['Build', 'Cut back', 'Stop', 'Final'];

export default function ChallengeUxPreviewHub() {
  const router = useRouter();
  const preview = useChallengeUxPreview();

  const open = (scenario: ChallengeUxScenario) => {
    void playSelectionHaptic();
    preview.selectScenario(scenario.id);
    router.push(`/challenge-ux-preview/${scenario.landing}` as Href);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Returns to the Kinwin welcome screen"
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

        <View style={styles.noticeCard}>
          <Text style={styles.noticeLabel}>INTERNAL PROTOTYPE</Text>
          <Text style={styles.noticeTitle}>The daily active-challenge experience — not the production app.</Text>
          <Text style={styles.noticeBody}>
            Every status below is computed by the real, merged Check-in Engine from a typed fixture —
            not hardcoded UI copy. Nothing here is saved outside this session; reloading resets
            everything. Pick any state to inspect it directly, without replaying a challenge.
          </Text>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>ACTIVE CHALLENGE · CHECK-IN UX</Text>
          <Text style={styles.title}>What using Kinwin feels like every day.</Text>
          <Text style={styles.subtitle}>21 review states across Build, Cut back, Stop, and the final result.</Text>
        </View>

        {GROUPS.map((group) => (
          <Fragment key={group}>
            <Text style={styles.groupLabel}>{group.toUpperCase()}</Text>
            <View style={styles.rows}>
              {CHALLENGE_UX_SCENARIOS.filter((s) => s.menuGroup === group).map((scenario) => (
                <Pressable
                  accessibilityHint={`Opens the ${scenario.menuLabel} state`}
                  accessibilityRole="button"
                  key={scenario.id}
                  onPress={() => open(scenario)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <Text style={styles.rowLabel}>{scenario.menuLabel}</Text>
                  <Text aria-hidden style={styles.rowArrow}>→</Text>
                </Pressable>
              ))}
            </View>
          </Fragment>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  header: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    minHeight: 52, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 26, paddingTop: 6,
  },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, marginRight: 4, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  noticeCard: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    marginTop: 22, gap: 8,
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 26, marginHorizontal: 20, paddingVertical: 18,
  },
  noticeLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  noticeTitle: { color: theme.colors.bone, fontSize: 15, fontWeight: '700' },
  noticeBody: { color: theme.colors.boneMuted, fontSize: 12.5, lineHeight: 19 },
  copy: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 10, paddingHorizontal: 26, paddingTop: 30, paddingBottom: 18,
  },
  eyebrow: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  title: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 26, lineHeight: 32,
  },
  subtitle: { color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
  groupLabel: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    color: theme.colors.copperBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.6,
    paddingHorizontal: 26, paddingTop: 18, paddingBottom: 6,
  },
  rows: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    borderTopWidth: 1, borderColor: theme.colors.structureLine, paddingHorizontal: 26,
  },
  row: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderColor: theme.colors.structureLine,
  },
  rowPressed: { backgroundColor: theme.colors.surface },
  rowLabel: { flex: 1, color: theme.colors.boneMuted, fontSize: 14, lineHeight: 20, paddingRight: 12 },
  rowArrow: { color: theme.colors.copperBright, fontSize: 16 },
});
