import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { kinwinTheme as theme } from '@/constants/theme';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';

const USER_BRANCH_COOL = '#788087';
const USER_BRANCH_SURFACE = '#151519';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

function formatNames(names: string[]) {
  if (names.length === 0) return 'your recipients';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export default function ReviewScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const {
    experienceCategory,
    goal,
    recipients,
    rewardOrganizer,
    setSitOutAcknowledged,
    sitOutAcknowledged,
    stakeAmount,
  } = onboarding;
  const [reviewCaptured, setReviewCaptured] = useState(false);
  const revealProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const confirmationProgress = useSharedValue(0);
  const acknowledgementProgress = useSharedValue(sitOutAcknowledged ? 1 : 0.94);
  const successRule = calculateSuccessRule(onboarding);

  const recipientNames = recipients
    .map((recipient) => recipient.name.trim())
    .filter(Boolean);
  const recipientNamesText = formatNames(recipientNames);
  const organizerName =
    rewardOrganizer?.type === 'recipient'
      ? recipients.find((recipient) => recipient.id === rewardOrganizer.recipientId)?.name.trim()
      : rewardOrganizer?.name.trim();
  const categoryLabel = experienceCategory ? CATEGORY_LABELS[experienceCategory] : null;
  const formattedStake = stakeAmount ? `$${stakeAmount.toLocaleString('en-US')}` : null;
  const hasValidOrganizer = Boolean(
    rewardOrganizer?.type === 'recipient'
      ? recipients.some(
          (recipient) =>
            recipient.id === rewardOrganizer.recipientId && recipient.name.trim().length > 0,
        )
      : rewardOrganizer?.name.trim(),
  );
  const consequenceIsComplete = Boolean(
    recipientNames.length > 0 &&
      recipientNames.length === recipients.length &&
      hasValidOrganizer &&
      experienceCategory &&
      stakeAmount &&
      stakeAmount > 0,
  );
  const canContinue = consequenceIsComplete && sitOutAcknowledged;

  useEffect(() => {
    revealProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [reducedMotion, revealProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      confirmationProgress.value = reviewCaptured ? 1 : 0;
      acknowledgementProgress.value = sitOutAcknowledged ? 1 : 0.94;
      return;
    }

    confirmationProgress.value = withTiming(reviewCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
    acknowledgementProgress.value = withTiming(sitOutAcknowledged ? 1 : 0.94, {
      duration: reducedMotion ? 0 : theme.motion.quick,
    });
  }, [
    acknowledgementProgress,
    confirmationProgress,
    reducedMotion,
    reviewCaptured,
    sitOutAcknowledged,
  ]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - revealProgress.value) * 10 },
    ],
  }));

  const acknowledgementStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : acknowledgementProgress.value }],
  }));

  const confirmationStyle = useAnimatedStyle(() => ({
    opacity: confirmationProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - confirmationProgress.value) * 6 },
    ],
  }));

  const toggleAcknowledgement = () => {
    void playSelectionHaptic();
    setSitOutAcknowledged((current) => !current);
    setReviewCaptured(false);
  };

  const continueFromReview = () => {
    if (!canContinue || reviewCaptured) return;
    void playImportantHaptic();
    setReviewCaptured(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View aria-hidden pointerEvents="none" style={styles.backgroundGeometry}>
        <View style={styles.deepPlane} />
        <View style={styles.frameLine} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, revealStyle]}>
          <View style={styles.header}>
            <View style={styles.brandGroup}>
              <Pressable
                accessibilityHint="Returns to the shared experience and stake step"
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.dismissTo('/consequence/experience')}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.backButtonPressed,
                ]}
              >
                <Text aria-hidden style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.wordmark}>KINWIN</Text>
            </View>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.stepLabel}
            >
              4 of 4
            </Text>
          </View>

          <OnboardingProgress
            accessibilityLabel="Consequence setup, step 4 of 4"
            currentStep={4}
            reducedMotion={reducedMotion}
            settled={reviewCaptured}
            totalSteps={4}
          />

          <View style={styles.main}>
            <View style={styles.intro}>
              <Text style={styles.phaseLabel}>THE TWO FUTURES</Text>
              <Text style={styles.headline}>Review your promise.</Text>
              <Text style={styles.supportingCopy}>
                One challenge. Two clear outcomes. Make sure both feel honest before moving on.
              </Text>
              <Text style={styles.secondaryCopy}>
                Nothing is charged, shared, or activated on this screen.
              </Text>
            </View>

            <View style={styles.promiseSurface}>
              <View aria-hidden style={styles.promiseNode} />
              <View style={styles.promiseContent}>
                <Text style={styles.sectionLabel}>YOUR CHALLENGE</Text>
                {goal.trim().length > 0 && (
                  <Text numberOfLines={2} style={styles.goalText}>{goal.trim()}</Text>
                )}
                <Text numberOfLines={3} style={styles.challengeText}>
                  {successRule?.challengeSummary ??
                    'Your behavior, rhythm, and timeframe remain as defined in onboarding.'}
                </Text>
                <View style={styles.successRuleRow}>
                  <Text style={styles.successRuleLabel}>SUCCESS MEANS</Text>
                  <Text style={styles.successRuleText}>
                    {successRule?.overall ?? 'Meeting the success rule you reviewed.'}
                  </Text>
                </View>
              </View>
            </View>

            <View
              accessibilityLabel="Two futures: you keep the change when you succeed; recipients receive the shared experience if the challenge fails"
              style={styles.futures}
            >
              <View aria-hidden style={styles.incomingThread} />
              <View aria-hidden style={styles.forkNode} />
              <View aria-hidden style={[styles.branchLine, styles.userBranchLine]} />
              <View aria-hidden style={[styles.branchLine, styles.recipientBranchLine]} />
              <View style={styles.branchRow}>
                <View style={[styles.futureBranch, styles.userBranch]}>
                  <Text style={styles.userBranchLabel}>IF YOU SUCCEED</Text>
                  <Text style={styles.futureTitle}>You keep the change.</Text>
                  <Text style={styles.futureText}>
                    Nothing is charged. The promise stays yours.
                  </Text>
                </View>
                <View style={[styles.futureBranch, styles.recipientBranch]}>
                  <Text style={styles.recipientBranchLabel}>IF THE CHALLENGE FAILS</Text>
                  <Text style={styles.futureTitle}>They receive the experience.</Text>
                  <Text style={styles.futureText}>
                    {formattedStake && categoryLabel
                      ? `${formattedStake} funds one shared ${categoryLabel.toLowerCase()} reward for ${recipientNamesText}.`
                      : 'Your total stake funds one shared, category-restricted reward.'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.practicalSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>RECIPIENTS</Text>
                <Text style={styles.summaryValue}>{recipientNamesText}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>ORGANIZER</Text>
                <Text style={styles.summaryValue}>
                  {organizerName || 'Your selected adult organizer'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>EXPERIENCE</Text>
                <Text style={styles.summaryValue}>
                  {categoryLabel || 'Your selected category'} · {formattedStake || 'Total stake'}
                </Text>
              </View>
            </View>

            <Animated.View style={acknowledgementStyle}>
              <Pressable
                accessibilityHint="Confirms that you will not participate in the recipients’ experience if the challenge fails"
                accessibilityLabel="I will sit out the recipients’ experience if the challenge fails"
                accessibilityRole="button"
                accessibilityState={{ selected: sitOutAcknowledged }}
                hitSlop={3}
                onPress={toggleAcknowledgement}
                style={({ pressed }) => [
                  styles.acknowledgement,
                  sitOutAcknowledged && styles.acknowledgementSelected,
                  pressed && styles.acknowledgementPressed,
                ]}
              >
                <View
                  aria-hidden
                  style={[
                    styles.acknowledgementMark,
                    sitOutAcknowledged && styles.acknowledgementMarkSelected,
                  ]}
                >
                  <Text style={styles.acknowledgementCheck}>
                    {sitOutAcknowledged ? '✓' : ''}
                  </Text>
                </View>
                <View style={styles.acknowledgementCopy}>
                  <Text style={styles.acknowledgementText}>
                    If the challenge fails, the reward is for my recipients. I will not take part
                    in their experience.
                  </Text>
                  <Text style={styles.acknowledgementHelper}>
                    This is your sit-out promise—not a payment or activation.
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          </View>

          <View style={styles.footer}>
            <View style={styles.confirmationSlot}>
              <Animated.View
                accessibilityElementsHidden={!reviewCaptured}
                accessibilityLiveRegion="polite"
                importantForAccessibility={reviewCaptured ? 'yes' : 'no-hide-descendants'}
                style={[styles.confirmationPanel, confirmationStyle]}
              >
                {reviewCaptured && (
                  <>
                    <View aria-hidden style={styles.confirmationNode} />
                    <Text style={styles.confirmation}>
                      Consequence reviewed. Payment setup and invitations come later.
                    </Text>
                  </>
                )}
              </Animated.View>
            </View>
            <AnimatedPrimaryButton
              accessibilityHint={
                canContinue
                  ? 'Confirms this local consequence review without activating the challenge'
                  : consequenceIsComplete
                    ? 'Acknowledge the sit-out promise before continuing'
                    : 'Complete the earlier consequence steps before continuing'
              }
              disabled={!canContinue || reviewCaptured}
              label="Continue"
              onPress={continueFromReview}
              reducedMotion={reducedMotion}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.ink },
  backgroundGeometry: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  deepPlane: {
    position: 'absolute', top: 62, right: 12, bottom: 12, left: 12,
    borderRadius: theme.radius.precise, backgroundColor: theme.colors.deepInk, opacity: 0.62,
  },
  frameLine: {
    position: 'absolute', top: 62, right: 12, bottom: 12, left: 12,
    borderWidth: 1, borderColor: theme.colors.structureLine,
    borderRadius: theme.radius.precise, opacity: 0.34,
  },
  scrollContent: { flexGrow: 1 },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
    paddingHorizontal: 26, paddingTop: 6, paddingBottom: 18,
  },
  header: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginLeft: -9, borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  stepLabel: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0.8 },
  main: { gap: 20, paddingTop: 12 },
  intro: { gap: 8 },
  phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 38, fontWeight: '400', letterSpacing: -0.6, lineHeight: 44,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  secondaryCopy: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  promiseSurface: {
    minHeight: 118, flexDirection: 'row', alignItems: 'flex-start',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    borderLeftWidth: 2, borderLeftColor: theme.colors.copper,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 13,
  },
  promiseNode: { width: 7, height: 7, marginTop: 4, marginRight: 12, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  promiseContent: { flex: 1 },
  sectionLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  goalText: { marginTop: 7, color: theme.colors.bone, fontSize: 16, fontWeight: '700', lineHeight: 21 },
  challengeText: { marginTop: 5, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  successRuleRow: { marginTop: 9, borderTopWidth: 1, borderTopColor: theme.colors.structureLine, paddingTop: 8 },
  successRuleLabel: { color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  successRuleText: { marginTop: 4, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 16 },
  futures: { position: 'relative', minHeight: 210, paddingTop: 44 },
  incomingThread: { position: 'absolute', top: 0, left: '50%', width: 1, height: 15, backgroundColor: theme.colors.copper, opacity: 0.76 },
  forkNode: {
    position: 'absolute', top: 13, left: '50%', width: 10, height: 10, marginLeft: -5,
    borderWidth: 1, borderColor: theme.colors.copperBright,
    borderRadius: 2, backgroundColor: theme.colors.copperDeep,
    transform: [{ rotate: '45deg' }],
  },
  branchLine: { position: 'absolute', top: 18, width: '25%', height: 1 },
  userBranchLine: { right: '50%', backgroundColor: USER_BRANCH_COOL, transform: [{ rotate: '-10deg' }], transformOrigin: 'right center', opacity: 0.7 },
  recipientBranchLine: { left: '50%', backgroundColor: theme.colors.copperBright, transform: [{ rotate: '10deg' }], transformOrigin: 'left center', opacity: 0.9 },
  branchRow: { flexDirection: 'row', gap: 14 },
  futureBranch: { flex: 1, minHeight: 166, borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 15 },
  userBranch: { borderTopColor: USER_BRANCH_COOL, borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, backgroundColor: USER_BRANCH_SURFACE },
  recipientBranch: { borderTopColor: theme.colors.copperBright, borderBottomWidth: 2, borderBottomColor: theme.colors.copper, backgroundColor: theme.colors.surfaceRaised },
  userBranchLabel: { color: USER_BRANCH_COOL, fontSize: 8, fontWeight: '800', letterSpacing: 0.85 },
  recipientBranchLabel: { color: theme.colors.copperBright, fontSize: 8, fontWeight: '800', letterSpacing: 0.75 },
  futureTitle: { marginTop: 10, color: theme.colors.bone, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  futureText: { marginTop: 8, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 17 },
  practicalSummary: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface },
  summaryRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, paddingHorizontal: 14, paddingVertical: 9 },
  summaryLabel: { width: 90, color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  summaryValue: { flex: 1, color: theme.colors.boneMuted, fontSize: 12, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  acknowledgement: { minHeight: 112, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surface, paddingHorizontal: 15, paddingVertical: 14 },
  acknowledgementSelected: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.surfaceRaised },
  acknowledgementPressed: { backgroundColor: theme.colors.surfaceFocused },
  acknowledgementMark: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginRight: 13, borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: 3, backgroundColor: theme.colors.deepInk },
  acknowledgementMarkSelected: { borderColor: theme.colors.copperBright, backgroundColor: theme.colors.copperDeep },
  acknowledgementCheck: { color: theme.colors.copperBright, fontSize: 15, fontWeight: '800' },
  acknowledgementCopy: { flex: 1 },
  acknowledgementText: { color: theme.colors.bone, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  acknowledgementHelper: { marginTop: 6, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  footer: { marginTop: 'auto', paddingTop: 24 },
  confirmationSlot: { minHeight: 46, justifyContent: 'center', paddingBottom: 8 },
  confirmationPanel: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: theme.colors.copper, paddingHorizontal: 4, paddingVertical: 8 },
  confirmationNode: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  confirmation: { flex: 1, color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
});
