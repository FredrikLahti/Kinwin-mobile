import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { formatRecipientNames } from '@/components/share/recipient-promise-page';
import { kinwinTheme as theme } from '@/constants/theme';
import {
  ExperienceCategory,
  RhythmState,
  useOnboarding,
} from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';

const COOL_NEUTRAL = '#7D8589';
const COOL_SURFACE = '#17191A';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

function buildCommitment(behavior: string, rhythm: RhythmState) {
  if (rhythm.type === 'daily') return `${behavior} · Every day`;
  if (rhythm.type === 'weekly_count') {
    const target = Number(rhythm.targetValue);
    return `${behavior} · ${rhythm.targetValue} ${target === 1 ? 'time' : 'times'} per week`;
  }
  if (rhythm.type === 'specific_days') {
    const count = rhythm.selectedWeekdays.length;
    return `${behavior} · ${count} specific ${count === 1 ? 'day' : 'days'} per week`;
  }
  if (rhythm.type === 'maximum_per_period') {
    const unit = rhythm.timeUnit || rhythm.amountUnit.trim() || 'times';
    return `${behavior} · Maximum ${rhythm.targetValue} ${unit} per ${rhythm.period}`;
  }
  return `${behavior} · Continuous`;
}

function buildCurrentRequirement(direction: ReturnType<typeof useOnboarding>['behaviorDirection'], rhythm: RhythmState) {
  if (direction === 'build') {
    if (rhythm.type === 'weekly_count') {
      return `This week · 0 of ${rhythm.targetValue} complete`;
    }
    if (rhythm.type === 'specific_days') {
      return `This week · 0 of ${rhythm.selectedWeekdays.length} complete`;
    }
    return 'Today · No check-in yet';
  }

  if (direction === 'cut') {
    return rhythm.period === 'week'
      ? 'This week · No check-in yet'
      : 'Today · No check-in yet';
  }

  return 'Today · No check-in yet';
}

function buildCheckInCopy(direction: ReturnType<typeof useOnboarding>['behaviorDirection']) {
  if (direction === 'build') return 'Check in after you complete the behavior.';
  if (direction === 'cut') {
    return 'Check in with the amount, time, or count for the current period.';
  }
  return 'Confirm that you are still keeping the promise.';
}

export default function ActiveChallengeScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const {
    behaviorDirection,
    behaviorText,
    durationWeeks,
    experienceCategory,
    goal,
    recipients,
    rewardOrganizer,
    rhythm,
    sitOutAcknowledged,
    stakeAmount,
  } = onboarding;
  const [checkInPreviewed, setCheckInPreviewed] = useState(false);
  const revealProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const feedbackProgress = useSharedValue(0);
  const successRule = calculateSuccessRule(onboarding);

  const validRecipients = recipients.filter((recipient) => recipient.name.trim().length > 0);
  const recipientNames = validRecipients.map((recipient) => recipient.name.trim());
  const recipientNamesText = formatRecipientNames(recipientNames);
  const organizerRecipient =
    rewardOrganizer?.type === 'recipient'
      ? validRecipients.find((recipient) => recipient.id === rewardOrganizer.recipientId)
      : null;
  const organizerName =
    rewardOrganizer?.type === 'recipient'
      ? organizerRecipient?.name.trim() ?? ''
      : rewardOrganizer?.name.trim() ?? '';
  const organizerIsValid =
    rewardOrganizer?.type === 'recipient'
      ? Boolean(organizerRecipient)
      : rewardOrganizer?.type === 'other' && organizerName.length > 0;
  const draftIsValid = Boolean(
    successRule &&
      behaviorDirection &&
      durationWeeks &&
      validRecipients.length > 0 &&
      organizerIsValid &&
      experienceCategory &&
      stakeAmount &&
      Number.isFinite(stakeAmount) &&
      stakeAmount > 0 &&
      sitOutAcknowledged,
  );

  const totalDays = (durationWeeks ?? 0) * 7;
  const commitment = buildCommitment(behaviorText.trim(), rhythm);
  const currentRequirement = buildCurrentRequirement(behaviorDirection, rhythm);
  const checkInCopy = buildCheckInCopy(behaviorDirection);
  const categoryLabel = experienceCategory ? CATEGORY_LABELS[experienceCategory] : '';
  const stakeLabel = stakeAmount ? `$${stakeAmount.toLocaleString('en-US')}` : '';
  const organizerCopy =
    rewardOrganizer?.type === 'recipient'
      ? `${organizerName} organizes it.`
      : `${organizerName} organizes it but is not included in the experience.`;

  useEffect(() => {
    revealProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [reducedMotion, revealProgress]);

  useEffect(() => {
    feedbackProgress.value = withTiming(checkInPreviewed ? 1 : 0, {
      duration: reducedMotion ? 0 : theme.motion.quick,
    });
  }, [checkInPreviewed, feedbackProgress, reducedMotion]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [{ translateY: reducedMotion ? 0 : (1 - revealProgress.value) * 10 }],
  }));

  const feedbackStyle = useAnimatedStyle(() => ({
    opacity: feedbackProgress.value,
    transform: [{ translateY: reducedMotion ? 0 : (1 - feedbackProgress.value) * 5 }],
  }));

  const previewCheckIn = () => {
    if (checkInPreviewed) return;
    void playImportantHaptic();
    setCheckInPreviewed(true);
  };

  const recoveryRoute = successRule ? '/consequence/review' : '/onboarding/goal';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View aria-hidden pointerEvents="none" style={styles.backgroundGeometry}>
        <View style={styles.deepPlane} />
        <View style={styles.frameLine} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.content, revealStyle]}>
          <View
            accessibilityLabel="Active challenge preview. This challenge has not actually been activated."
            accessibilityRole="summary"
            style={styles.previewNotice}
          >
            <View aria-hidden style={styles.previewMark} />
            <View style={styles.previewCopy}>
              <Text style={styles.previewLabel}>ACTIVE CHALLENGE PREVIEW</Text>
              <Text style={styles.previewText}>This challenge has not actually been activated.</Text>
            </View>
          </View>

          <View style={styles.header}>
            <View style={styles.brandGroup}>
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
              <Text style={styles.wordmark}>KINWIN</Text>
            </View>
            <View accessibilityLabel="Challenge status, active" style={styles.activeStatus}>
              <View aria-hidden style={styles.activeNode} />
              <Text style={styles.activeText}>ACTIVE</Text>
            </View>
          </View>

          {!draftIsValid ? (
            <View style={styles.invalidContent}>
              <Text style={styles.phaseLabel}>YOUR CHALLENGE</Text>
              <Text accessibilityRole="header" style={styles.headline}>This preview needs a complete draft.</Text>
              <Text style={styles.supportingCopy}>
                Finish the challenge and consequence setup before reviewing the active state.
              </Text>
              <AnimatedPrimaryButton
                accessibilityHint="Returns to the relevant setup screen"
                label={successRule ? 'Review consequence' : 'Review challenge setup'}
                onPress={() => router.push(recoveryRoute as Href)}
                reducedMotion={reducedMotion}
              />
            </View>
          ) : (
            <>
              <View style={styles.intro}>
                <Text style={styles.phaseLabel}>YOUR CHALLENGE</Text>
                <Text accessibilityRole="header" style={styles.headline}>Keep the promise.</Text>
                <Text style={styles.supportingCopy}>
                  You already decided what matters. Now focus on the next action.
                </Text>
              </View>

              <View style={styles.identitySection}>
                <Text style={styles.sectionLabel}>WHAT THIS IS FOR</Text>
                <Text style={styles.goalText}>{goal.trim()}</Text>
                <View style={styles.commitmentLine}>
                  <View aria-hidden style={styles.commitmentMark} />
                  <View style={styles.commitmentCopy}>
                    <Text style={styles.commitmentText}>{commitment}</Text>
                    <Text style={styles.timeframeText}>{durationWeeks} weeks</Text>
                  </View>
                </View>
              </View>

              <View
                accessibilityLabel={`Day 1 of ${totalDays}. ${currentRequirement}. On track. The challenge has just begun.`}
                style={styles.statusSection}
              >
                <View aria-hidden style={styles.timeline}>
                  <View style={styles.incomingThread} />
                  <View style={styles.currentNode}><View style={styles.currentCore} /></View>
                  <View style={styles.futureThread} />
                  <View style={styles.futureFork} />
                </View>
                <View style={styles.statusContent}>
                  <Text style={styles.dayLabel}>DAY 1 OF {totalDays}</Text>
                  <Text style={styles.requirementText}>{currentRequirement}</Text>
                  <View style={styles.trackState}>
                    <Text style={styles.trackTitle}>On track</Text>
                    <Text style={styles.trackCopy}>The challenge has just begun.</Text>
                  </View>
                </View>
              </View>

              <View style={styles.todaySection}>
                <Text style={styles.sectionLabel}>TODAY</Text>
                <Text accessibilityRole="header" style={styles.todayHeadline}>Your next check-in</Text>
                <Text style={styles.todayCopy}>{checkInCopy}</Text>
                <AnimatedPrimaryButton
                  accessibilityHint="Previews the future check-in flow without recording activity"
                  disabled={checkInPreviewed}
                  label="Check in"
                  onPress={previewCheckIn}
                  reducedMotion={reducedMotion}
                />
                <View style={styles.feedbackSlot}>
                  <Animated.View
                    accessibilityElementsHidden={!checkInPreviewed}
                    accessibilityLiveRegion="polite"
                    importantForAccessibility={checkInPreviewed ? 'yes' : 'no-hide-descendants'}
                    style={[styles.feedback, feedbackStyle]}
                  >
                    {checkInPreviewed && (
                      <>
                        <View aria-hidden style={styles.feedbackNode} />
                        <Text style={styles.feedbackText}>The check-in flow comes next.</Text>
                      </>
                    )}
                  </Animated.View>
                </View>
                <Text style={styles.prototypeLine}>Nothing is recorded in this prototype.</Text>
              </View>

              <View style={styles.ruleSection}>
                <Text style={styles.sectionLabel}>HOW YOU SUCCEED</Text>
                <Text style={styles.ruleText}>{successRule?.overall}</Text>
                {successRule?.continuity && (
                  <Text style={styles.ruleContinuity}>{successRule.continuity}</Text>
                )}
              </View>

              <View style={styles.consequenceSection}>
                <View aria-hidden style={styles.consequenceThread} />
                <Text style={styles.sectionLabel}>THE OTHER FUTURE</Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={styles.stakeText}>{stakeLabel}</Text>
                <Text style={styles.consequenceText}>
                  One shared {categoryLabel} experience for {recipientNamesText} if the challenge fails.
                </Text>
                <Text style={styles.organizerText}>{organizerCopy}</Text>
                <Text style={styles.sitOutText}>You will not take part.</Text>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  backgroundGeometry: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  deepPlane: {
    position: 'absolute', top: 82, right: 12, bottom: 12, left: 12,
    borderRadius: theme.radius.precise, backgroundColor: theme.colors.deepInk, opacity: 0.62,
  },
  frameLine: {
    position: 'absolute', top: 82, right: 12, bottom: 12, left: 12,
    borderWidth: 1, borderColor: theme.colors.structureLine,
    borderRadius: theme.radius.precise, opacity: 0.3,
  },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center',
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 26,
  },
  previewNotice: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    paddingHorizontal: 11, paddingVertical: 9,
  },
  previewMark: { width: 16, height: 1, marginRight: 11, backgroundColor: theme.colors.warmGrey },
  previewCopy: { flex: 1 },
  previewLabel: { color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  previewText: { marginTop: 3, color: theme.colors.warmGrey, fontSize: 10, lineHeight: 14 },
  header: {
    minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  activeStatus: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  activeNode: { width: 6, height: 6, borderRadius: 3, backgroundColor: COOL_NEUTRAL },
  activeText: { color: COOL_NEUTRAL, fontSize: 9, fontWeight: '800', letterSpacing: 1.25 },
  invalidContent: { gap: 14, paddingTop: 30 },
  intro: { gap: 8, paddingTop: 18 },
  phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 40, fontWeight: '400', letterSpacing: -0.7, lineHeight: 46,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  sectionLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  identitySection: {
    marginTop: 26, borderTopWidth: 1, borderTopColor: theme.colors.copper,
    borderBottomWidth: 1, borderBottomColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 20, paddingVertical: 20,
  },
  goalText: {
    marginTop: 13, color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 26, lineHeight: 32,
  },
  commitmentLine: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 19 },
  commitmentMark: { width: 20, height: 1, marginTop: 9, marginRight: 12, backgroundColor: theme.colors.copper },
  commitmentCopy: { flex: 1 },
  commitmentText: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  timeframeText: { marginTop: 4, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  statusSection: { minHeight: 180, flexDirection: 'row', paddingTop: 25, paddingBottom: 18 },
  timeline: { position: 'relative', width: 46, alignItems: 'center' },
  incomingThread: { position: 'absolute', top: 0, width: 1, height: 30, backgroundColor: theme.colors.copper },
  currentNode: {
    position: 'absolute', top: 28, width: 25, height: 25, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: 13,
    backgroundColor: theme.colors.copperDeep,
  },
  currentCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  futureThread: { position: 'absolute', top: 52, bottom: 20, width: 1, backgroundColor: theme.colors.copper, opacity: 0.68 },
  futureFork: {
    position: 'absolute', bottom: 16, width: 25, height: 9,
    borderTopWidth: 1, borderRightWidth: 1, borderColor: theme.colors.copper,
    transform: [{ rotate: '45deg' }], opacity: 0.68,
  },
  statusContent: { flex: 1, paddingTop: 1 },
  dayLabel: { color: theme.colors.copperBright, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  requirementText: { marginTop: 9, color: theme.colors.bone, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  trackState: {
    marginTop: 17, borderLeftWidth: 2, borderLeftColor: COOL_NEUTRAL,
    backgroundColor: COOL_SURFACE, paddingHorizontal: 13, paddingVertical: 11,
  },
  trackTitle: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  trackCopy: { marginTop: 3, color: COOL_NEUTRAL, fontSize: 11, lineHeight: 16 },
  todaySection: {
    borderTopWidth: 1, borderTopColor: theme.colors.copperBright,
    borderBottomWidth: 1, borderBottomColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 20, paddingTop: 19, paddingBottom: 15,
  },
  todayHeadline: {
    marginTop: 11, color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 27, lineHeight: 33,
  },
  todayCopy: { marginTop: 8, marginBottom: 18, color: theme.colors.boneMuted, fontSize: 13, lineHeight: 20 },
  feedbackSlot: { minHeight: 42, justifyContent: 'center' },
  feedback: {
    minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.copper, paddingTop: 9,
  },
  feedbackNode: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  feedbackText: { color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  prototypeLine: { color: theme.colors.warmGrey, fontSize: 10, lineHeight: 15 },
  ruleSection: {
    marginTop: 24, borderLeftWidth: 2, borderLeftColor: theme.colors.copper,
    paddingLeft: 16, paddingVertical: 4,
  },
  ruleText: {
    marginTop: 10, color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 21, lineHeight: 28,
  },
  ruleContinuity: { marginTop: 8, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  consequenceSection: {
    position: 'relative', marginTop: 26, overflow: 'hidden',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderTopColor: theme.colors.structureLineStrong, borderBottomColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 18, paddingVertical: 19,
  },
  consequenceThread: { position: 'absolute', top: 0, right: 18, width: 1, height: 54, backgroundColor: theme.colors.copper, opacity: 0.58 },
  stakeText: {
    marginTop: 13, color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 32, lineHeight: 38,
  },
  consequenceText: { marginTop: 7, color: theme.colors.boneMuted, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  organizerText: { marginTop: 13, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  sitOutText: { marginTop: 5, color: theme.colors.copperBright, fontSize: 11, lineHeight: 17 },
});
