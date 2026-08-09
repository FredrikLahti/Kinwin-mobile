import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PreviewTagV2 } from '@/components/v2/preview-tag';
import { ProgressBarV2, WeekBarsV2 } from '@/components/v2/stat-bar';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { demoProgressDetail } from '@/fixtures/ux-v2-preview';

export default function ProgressPreviewV2() {
  const router = useRouter();
  const { consistency, currentStreakWeeks, weeks, challengeCompletion } = demoProgressDetail;
  const completionPercent = Math.round((challengeCompletion.completed / challengeCompletion.total) * 100);

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable
          accessibilityHint="Goes back"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Feather color={theme.colors.crimsonBright} name="chevron-left" size={26} />
        </Pressable>
        <Text style={styles.wordmark}>PROGRESS</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <PreviewTagV2 />

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>CONSISTENCY THIS MONTH</Text>
          <Text style={styles.heroValue}>{consistency}%</Text>
          <ProgressBarV2 percent={consistency} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>CURRENT STREAK</Text>
          <Text style={styles.streakValue}>{currentStreakWeeks} successful weeks</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>LAST 4 WEEKS</Text>
          <View style={styles.chartWrap}>
            <WeekBarsV2 weeks={weeks} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{challengeCompletion.name.toUpperCase()}</Text>
          <Text style={styles.completionValue}>
            {challengeCompletion.completed} of {challengeCompletion.total} periods
          </Text>
          <ProgressBarV2 percent={completionPercent} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  header: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: theme.spacing.medium,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backButtonPressed: { opacity: 0.7 },
  wordmark: { color: theme.colors.ivory, fontSize: 13, fontWeight: '700', letterSpacing: 4 },
  scrollContent: {
    width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: theme.spacing.medium, paddingBottom: theme.spacing.xlarge, gap: theme.spacing.small,
  },
  heroCard: {
    marginTop: theme.spacing.xsmall, borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.oxblood, backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.medium, gap: 10,
  },
  heroLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  heroValue: { color: theme.colors.ivory, fontSize: 40, fontWeight: '700' },
  card: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, padding: theme.spacing.medium, gap: 10,
  },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  streakValue: { color: theme.colors.ivory, fontSize: 18, fontWeight: '700' },
  chartWrap: { marginTop: 4 },
  completionValue: { color: theme.colors.ivory, fontSize: 15, fontWeight: '700' },
});
