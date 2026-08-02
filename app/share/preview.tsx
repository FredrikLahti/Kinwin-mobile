import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPrimaryButton } from '@/components/animated-primary-button';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { RecipientPromisePage } from '@/components/share/recipient-promise-page';
import { kinwinTheme as theme } from '@/constants/theme';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'Adventure',
  culture: 'Culture',
  dinner: 'Dinner',
  getaway: 'Getaway',
  wellness: 'Wellness',
};

export default function SharePreviewScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const {
    behaviorText,
    durationWeeks,
    experienceCategory,
    goal,
    recipients,
    rewardOrganizer,
    sitOutAcknowledged,
    stakeAmount,
  } = onboarding;
  const revealProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const successRule = calculateSuccessRule(onboarding);

  const validRecipients = recipients.filter((recipient) => recipient.name.trim().length > 0);
  const recipientNames = validRecipients.map((recipient) => recipient.name.trim());
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
  const categoryLabel = experienceCategory ? CATEGORY_LABELS[experienceCategory] : 'Experience';
  const stakeLabel =
    stakeAmount && Number.isFinite(stakeAmount) && stakeAmount > 0
      ? `$${stakeAmount.toLocaleString('en-US')}`
      : 'The stake';
  const challengeSummary = successRule?.challengeSummary ?? 'Challenge details are incomplete.';
  const overallSuccessRule = successRule?.overall ?? 'The success rule is not yet available.';
  const canApprove = Boolean(
    goal.trim().length >= 3 &&
      behaviorText.trim().length >= 3 &&
      durationWeeks &&
      successRule &&
      validRecipients.length > 0 &&
      organizerIsValid &&
      experienceCategory &&
      stakeAmount &&
      Number.isFinite(stakeAmount) &&
      stakeAmount > 0 &&
      sitOutAcknowledged,
  );

  useEffect(() => {
    revealProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [reducedMotion, revealProgress]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - revealProgress.value) * 10 },
    ],
  }));

  const approvePreview = () => {
    if (!canApprove) return;
    void playImportantHaptic();
    router.push('/share/activate' as Href);
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
                accessibilityHint="Returns to the editable invitation message"
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.dismissTo('/share/message' as Href)}
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
              2 of 3
            </Text>
          </View>

          <OnboardingProgress
            accessibilityLabel="Share setup, step 2 of 3"
            currentStep={2}
            reducedMotion={reducedMotion}
            settled={false}
            totalSteps={3}
          />

          <View
            accessibilityLabel="Preview mode. Nothing here is sent or confirmed."
            style={styles.previewNotice}
          >
            <View aria-hidden style={styles.previewMark} />
            <View style={styles.previewNoticeCopy}>
              <Text style={styles.previewLabel}>PREVIEW MODE</Text>
              <Text style={styles.previewText}>Nothing here is sent or confirmed.</Text>
            </View>
          </View>

          <RecipientPromisePage
            categoryLabel={categoryLabel}
            challengeSummary={challengeSummary}
            goal={goal.trim() || 'Their larger goal will appear here.'}
            organizerIsRecipient={rewardOrganizer?.type === 'recipient'}
            organizerName={organizerName || 'The selected adult organizer'}
            recipientNames={recipientNames}
            stakeLabel={stakeLabel}
            successRule={overallSuccessRule}
          />

          <View style={styles.senderTools}>
            <Text style={styles.senderToolsLabel}>SENDER REVIEW</Text>
            <Text style={styles.senderToolsIntro}>
              These controls are outside the page your recipients will see.
            </Text>
            <View style={styles.editActions}>
              <Pressable
                accessibilityHint="Returns to edit the invitation message"
                accessibilityLabel="Edit message"
                accessibilityRole="button"
                onPress={() => router.dismissTo('/share/message' as Href)}
                style={({ pressed }) => [
                  styles.editAction,
                  pressed && styles.editActionPressed,
                ]}
              >
                <Text style={styles.editActionText}>Edit message</Text>
                <Text aria-hidden style={styles.editArrow}>↗</Text>
              </Pressable>
              <Pressable
                accessibilityHint="Returns to edit the experience category and stake"
                accessibilityLabel="Edit consequence"
                accessibilityRole="button"
                onPress={() => router.dismissTo('/consequence/experience' as Href)}
                style={({ pressed }) => [
                  styles.editAction,
                  pressed && styles.editActionPressed,
                ]}
              >
                <Text style={styles.editActionText}>Edit consequence</Text>
                <Text aria-hidden style={styles.editArrow}>↗</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.notSentText}>
              No link has been created and nothing has been sent.
            </Text>
            <AnimatedPrimaryButton
              accessibilityHint={
                canApprove
                  ? 'Continues to the membership and activation boundary'
                  : 'Complete the challenge and consequence draft before approving the preview'
              }
              disabled={!canApprove}
              label="Looks right"
              onPress={approvePreview}
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
    flexGrow: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 22,
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -9,
    borderRadius: theme.radius.precise,
  },
  backButtonPressed: { backgroundColor: theme.colors.surface },
  backIcon: { color: theme.colors.copperBright, fontSize: 32, fontWeight: '300', lineHeight: 35 },
  wordmark: { color: theme.colors.bone, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  stepLabel: { color: theme.colors.boneMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0.8 },
  previewNotice: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  previewMark: { width: 18, height: 1, marginRight: 12, backgroundColor: theme.colors.copper },
  previewNoticeCopy: { flex: 1 },
  previewLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  previewText: { marginTop: 3, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  senderTools: {
    marginTop: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  senderToolsLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  senderToolsIntro: { marginTop: 5, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  editActions: { flexDirection: 'row', gap: 9, marginTop: 13 },
  editAction: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.structureLineStrong,
    borderRadius: theme.radius.precise,
    backgroundColor: theme.colors.deepInk,
    paddingHorizontal: 12,
  },
  editActionPressed: { borderColor: theme.colors.copper, backgroundColor: theme.colors.surfaceFocused },
  editActionText: { color: theme.colors.boneMuted, fontSize: 12, fontWeight: '700' },
  editArrow: { color: theme.colors.copperBright, fontSize: 15 },
  footer: { marginTop: 18 },
  notSentText: { color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
