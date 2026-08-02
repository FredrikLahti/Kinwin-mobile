import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
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
import { useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';

export default function SuccessScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const [successCaptured, setSuccessCaptured] = useState(false);
  const entranceProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const confirmationProgress = useSharedValue(0);
  const anchorProgress = useSharedValue(0.88);
  const rule = calculateSuccessRule(onboarding);
  const upstreamSignature = JSON.stringify({
    behaviorDirection: onboarding.behaviorDirection,
    behaviorText: onboarding.behaviorText,
    definitionText: onboarding.definitionText,
    durationWeeks: onboarding.durationWeeks,
    goal: onboarding.goal,
    measurementMode: onboarding.measurementMode,
    rhythm: onboarding.rhythm,
  });
  const previousSignature = useRef(upstreamSignature);

  useEffect(() => {
    if (Platform.OS === 'web') {
      entranceProgress.value = 1;
      return;
    }

    entranceProgress.value = withTiming(1, {
      duration: reducedMotion ? 120 : theme.motion.standard,
    });
  }, [entranceProgress, reducedMotion]);

  useEffect(() => {
    if (previousSignature.current !== upstreamSignature) {
      previousSignature.current = upstreamSignature;
      setSuccessCaptured(false);
    }
  }, [upstreamSignature]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      confirmationProgress.value = successCaptured ? 1 : 0;
      anchorProgress.value = successCaptured ? 1 : 0.88;
      return;
    }

    confirmationProgress.value = withTiming(successCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
    anchorProgress.value = withTiming(successCaptured ? 1 : 0.88, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [anchorProgress, confirmationProgress, reducedMotion, successCaptured]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - entranceProgress.value) * 10 },
    ],
  }));

  const confirmationStyle = useAnimatedStyle(() => ({
    opacity: confirmationProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - confirmationProgress.value) * 6 },
    ],
  }));

  const anchorStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + anchorProgress.value * 0.28,
    transform: [{ scale: reducedMotion ? 1 : anchorProgress.value }],
  }));

  const continueWithRule = () => {
    if (!rule || successCaptured) return;
    Keyboard.dismiss();
    void playImportantHaptic();
    setSuccessCaptured(true);
  };

  const isStop = rule?.isStopRule ?? onboarding.behaviorDirection === 'stop';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View aria-hidden pointerEvents="none" style={styles.backgroundGeometry}>
        <View style={styles.deepPlane} />
        <View style={styles.frameLine} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, entranceStyle]}>
          <View style={styles.header}>
            <View style={styles.brandGroup}>
              <Pressable
                accessibilityHint="Returns to the timeframe step"
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.back()}
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
              6 of 6
            </Text>
          </View>

          <OnboardingProgress
            currentStep={6}
            reducedMotion={reducedMotion}
            settled={successCaptured}
            totalSteps={6}
          />

          <View style={styles.main}>
            <View style={styles.intro}>
              <Text style={styles.headline}>What will count as success?</Text>
              <Text style={styles.supportingCopy}>
                {isStop
                  ? 'You chose to stop completely, so this rule is intentionally clear and strict.'
                  : 'A strong promise should survive a difficult day without becoming easy to ignore.'}
              </Text>
              <Text style={styles.secondaryCopy}>Review the rule before moving on.</Text>
            </View>

            <View style={styles.challengeSummary}>
              <View aria-hidden style={styles.challengeNode} />
              <View style={styles.challengeContent}>
                <Text style={styles.challengeLabel}>YOUR CHALLENGE</Text>
                <Text numberOfLines={3} style={styles.challengeText}>
                  {rule?.challengeSummary ?? 'Complete the earlier steps to calculate your rule.'}
                </Text>
              </View>
            </View>

            {rule && !rule.isStopRule && (
              <View style={styles.ruleSequence}>
                <View aria-hidden style={styles.ruleThread} />
                <View style={styles.ruleBlock}>
                  <Animated.View aria-hidden style={[styles.ruleAnchor, anchorStyle]}>
                    <View style={styles.ruleAnchorCore} />
                  </Animated.View>
                  <View style={styles.ruleContent}>
                    <Text accessibilityRole="header" style={styles.ruleLabel}>OVERALL</Text>
                    <Text style={styles.ruleText}>{rule.overall}</Text>
                  </View>
                </View>
                <View style={styles.ruleBlock}>
                  <Animated.View aria-hidden style={[styles.ruleAnchor, anchorStyle]}>
                    <View style={styles.ruleAnchorCore} />
                  </Animated.View>
                  <View style={styles.ruleContent}>
                    <Text accessibilityRole="header" style={styles.ruleLabel}>CONTINUITY</Text>
                    <Text style={styles.ruleText}>{rule.continuity}</Text>
                  </View>
                </View>
              </View>
            )}

            {rule?.isStopRule && (
              <View style={styles.stopRule}>
                <View aria-hidden style={styles.stopThread} />
                <Animated.View aria-hidden style={[styles.stopAnchor, anchorStyle]}>
                  <View style={styles.stopAnchorCore} />
                </Animated.View>
                <View style={styles.stopRuleContent}>
                  <Text accessibilityRole="header" style={styles.stopLabel}>SUCCESS RULE</Text>
                  <View style={styles.zeroRow}>
                    <Text style={styles.zeroValue}>0</Text>
                    <Text style={styles.zeroUnit}>LAPSES</Text>
                  </View>
                  <Text style={styles.stopRuleText}>{rule.overall}</Text>
                  <Text style={styles.stopRuleDetail}>
                    A lapse means the financial challenge result is unsuccessful, but it does not
                    erase your progress or prevent recovery.
                  </Text>
                </View>
              </View>
            )}

            {rule && (
              <View style={styles.explanation}>
                <View aria-hidden style={styles.explanationMark} />
                <View style={styles.explanationContent}>
                  <Text style={styles.explanationTitle}>{rule.explanation}</Text>
                  {rule.explanationDetail && (
                    <Text style={styles.explanationDetail}>{rule.explanationDetail}</Text>
                  )}
                </View>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.confirmationSlot}>
              <Animated.View
                accessibilityElementsHidden={!successCaptured}
                accessibilityLiveRegion="polite"
                importantForAccessibility={successCaptured ? 'yes' : 'no-hide-descendants'}
                style={[styles.confirmationPanel, confirmationStyle]}
              >
                {successCaptured && (
                  <>
                    <View aria-hidden style={styles.confirmationNode} />
                    <Text style={styles.confirmation}>
                      Success rule set. Next, we’ll choose who wins if you don’t.
                    </Text>
                  </>
                )}
              </Animated.View>
            </View>
            <AnimatedPrimaryButton
              accessibilityHint={
                rule
                  ? 'Sets this success rule on the current development screen'
                  : 'Complete the earlier onboarding steps before continuing'
              }
              disabled={!rule || successCaptured}
              label="Continue"
              onPress={continueWithRule}
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
  main: { gap: 18, paddingTop: 16 },
  intro: { gap: 8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 39, fontWeight: '400', letterSpacing: -0.6, lineHeight: 45,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 15, lineHeight: 22 },
  secondaryCopy: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  challengeSummary: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    borderLeftWidth: 2, borderLeftColor: theme.colors.copper,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 11,
  },
  challengeNode: {
    width: 7, height: 7, marginRight: 12, borderRadius: 4,
    backgroundColor: theme.colors.copperBright,
  },
  challengeContent: { flex: 1 },
  challengeLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  challengeText: { marginTop: 6, color: theme.colors.bone, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  ruleSequence: { position: 'relative', gap: 8 },
  ruleThread: {
    position: 'absolute', top: 27, bottom: 27, left: 18, width: 1,
    backgroundColor: theme.colors.copper, opacity: 0.72,
  },
  ruleBlock: {
    minHeight: 92, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingVertical: 14, paddingRight: 16,
  },
  ruleAnchor: {
    width: 15, height: 15, marginHorizontal: 11, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.copperBright,
    borderRadius: 2, backgroundColor: theme.colors.copperDeep,
    transform: [{ rotate: '45deg' }],
  },
  ruleAnchorCore: { width: 6, height: 6, borderRadius: 1, backgroundColor: theme.colors.copperBright },
  ruleContent: { flex: 1 },
  ruleLabel: { color: theme.colors.copperBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  ruleText: { marginTop: 7, color: theme.colors.bone, fontSize: 17, fontWeight: '600', lineHeight: 23 },
  stopRule: {
    position: 'relative', overflow: 'hidden', minHeight: 190,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    borderLeftWidth: 2, borderLeftColor: theme.colors.copperBright,
    backgroundColor: theme.colors.surface, paddingHorizontal: 20, paddingVertical: 18,
  },
  stopThread: {
    position: 'absolute', top: 28, right: 0, left: 0, height: 1,
    backgroundColor: theme.colors.copper, opacity: 0.72,
  },
  stopAnchor: {
    position: 'absolute', top: 21, right: 24, width: 15, height: 15,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: theme.colors.copperBright, borderRadius: 8,
    backgroundColor: theme.colors.copperDeep,
  },
  stopAnchorCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  stopRuleContent: { paddingTop: 19 },
  stopLabel: { color: theme.colors.copperBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  zeroRow: { marginTop: 8, flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  zeroValue: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia' }),
    fontSize: 42, fontWeight: '400', lineHeight: 46,
  },
  zeroUnit: { color: theme.colors.copper, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  stopRuleText: { marginTop: 4, color: theme.colors.bone, fontSize: 17, fontWeight: '600', lineHeight: 23 },
  stopRuleDetail: { marginTop: 9, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  explanation: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.structureLine,
    paddingTop: 13,
  },
  explanationMark: { width: 18, height: 1, marginTop: 9, marginRight: 12, backgroundColor: theme.colors.copper },
  explanationContent: { flex: 1 },
  explanationTitle: { color: theme.colors.boneMuted, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  explanationDetail: { marginTop: 4, color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  footer: { marginTop: 'auto', paddingTop: 22 },
  confirmationSlot: { minHeight: 46, justifyContent: 'center', paddingBottom: 8 },
  confirmationPanel: {
    minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.copper,
    paddingHorizontal: 4, paddingVertical: 8,
  },
  confirmationNode: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  confirmation: { flex: 1, color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
});
