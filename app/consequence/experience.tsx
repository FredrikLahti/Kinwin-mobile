import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

const MAX_STAKE_INPUT_LENGTH = 7;

const EXPERIENCE_CATEGORIES: {
  description: string;
  label: string;
  value: ExperienceCategory;
}[] = [
  { description: 'A meal they can share.', label: 'Dinner', value: 'dinner' },
  { description: 'Time to recharge together.', label: 'Wellness', value: 'wellness' },
  { description: 'An active day or new experience.', label: 'Adventure', value: 'adventure' },
  { description: 'A show, exhibition, or event.', label: 'Culture', value: 'culture' },
  { description: 'A short trip or overnight stay.', label: 'Getaway', value: 'getaway' },
];

type ExperienceChoiceProps = {
  description: string;
  label: string;
  onPress: () => void;
  selected: boolean;
};

function ExperienceChoice({
  description,
  label,
  onPress,
  selected,
}: ExperienceChoiceProps) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={2}
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryChoice,
        selected && styles.selectedCategoryChoice,
        pressed && styles.choicePressed,
      ]}
    >
      <View aria-hidden style={styles.anchorColumn}>
        <View style={[styles.anchor, selected && styles.selectedAnchor]}>
          <View style={[styles.anchorCore, selected && styles.selectedAnchorCore]} />
        </View>
      </View>
      <View style={styles.categoryCopy}>
        <Text style={[styles.categoryLabel, selected && styles.selectedCategoryLabel]}>
          {label}
        </Text>
        <Text
          style={[
            styles.categoryDescription,
            selected && styles.selectedCategoryDescription,
          ]}
        >
          {description}
        </Text>
      </View>
      <View aria-hidden style={[styles.selectionRule, selected && styles.selectedRule]} />
    </Pressable>
  );
}

export default function ExperienceScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();
  const {
    experienceCategory,
    recipients,
    rewardOrganizer,
    setExperienceCategory,
    setStakeAmount,
    setStakeAmountInput,
    stakeAmount,
    stakeAmountInput,
  } = useOnboarding();
  const [experienceCaptured, setExperienceCaptured] = useState(false);
  const revealProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const confirmationProgress = useSharedValue(0);

  const canContinue = Boolean(experienceCategory && stakeAmount && stakeAmount > 0);
  const selectedCategory = EXPERIENCE_CATEGORIES.find(
    (category) => category.value === experienceCategory,
  );
  const organizerName =
    rewardOrganizer?.type === 'recipient'
      ? recipients.find((recipient) => recipient.id === rewardOrganizer.recipientId)?.name.trim()
      : rewardOrganizer?.name.trim();
  const recipientCount = recipients.length;
  const recipientLabel = recipientCount === 1 ? 'recipient' : 'recipients';
  const formattedStake = stakeAmount
    ? `$${stakeAmount.toLocaleString('en-US')}`
    : null;

  useEffect(() => {
    revealProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [reducedMotion, revealProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      confirmationProgress.value = experienceCaptured ? 1 : 0;
      return;
    }

    confirmationProgress.value = withTiming(experienceCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
  }, [confirmationProgress, experienceCaptured, reducedMotion]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - revealProgress.value) * 10 },
    ],
  }));

  const confirmationStyle = useAnimatedStyle(() => ({
    opacity: confirmationProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - confirmationProgress.value) * 6 },
    ],
  }));

  const selectCategory = (category: ExperienceCategory) => {
    void playSelectionHaptic();
    setExperienceCategory(category);
    setExperienceCaptured(false);
  };

  const updateStakeAmount = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, MAX_STAKE_INPUT_LENGTH);
    const numericAmount = digits ? Number(digits) : null;

    setStakeAmountInput(digits);
    setStakeAmount(numericAmount && numericAmount > 0 ? numericAmount : null);
    setExperienceCaptured(false);
  };

  const continueWithExperience = () => {
    if (!canContinue || experienceCaptured) return;
    Keyboard.dismiss();
    inputRef.current?.blur();
    void playImportantHaptic();
    setExperienceCaptured(false);
    router.push('/consequence/review');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View aria-hidden pointerEvents="none" style={styles.backgroundGeometry}>
        <View style={styles.deepPlane} />
        <View style={styles.frameLine} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.content, revealStyle]}>
            <View style={styles.header}>
              <View style={styles.brandGroup}>
                <Pressable
                  accessibilityHint="Returns to the reward organizer step"
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.dismissTo('/consequence/organizer')}
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
                3 of 4
              </Text>
            </View>

            <OnboardingProgress
              accessibilityLabel="Consequence setup, step 3 of 4"
              currentStep={3}
              reducedMotion={reducedMotion}
              settled={experienceCaptured}
              totalSteps={4}
            />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text style={styles.phaseLabel}>THE SHARED REWARD</Text>
                <Text style={styles.headline}>What could they experience?</Text>
                <Text style={styles.supportingCopy}>
                  Choose one kind of shared experience and the total stake that would fund it.
                </Text>
                <Text style={styles.secondaryCopy}>
                  If you succeed, nothing is charged.
                </Text>
              </View>

              <View style={styles.categorySection}>
                <View aria-hidden style={styles.categoryThread} />
                <Text style={styles.sectionLabel}>CHOOSE AN EXPERIENCE</Text>
                <View style={styles.categoryList}>
                  {EXPERIENCE_CATEGORIES.map((category) => (
                    <ExperienceChoice
                      key={category.value}
                      description={category.description}
                      label={category.label}
                      onPress={() => selectCategory(category.value)}
                      selected={experienceCategory === category.value}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.stakeSection}>
                <View aria-hidden style={styles.stakeConnector} />
                <View aria-hidden style={styles.stakeAnchor}>
                  <View style={styles.stakeAnchorCore} />
                </View>
                <Text style={styles.sectionLabel}>TOTAL STAKE</Text>
                <View style={styles.stakeSurface}>
                  <Text style={styles.stakeLabel}>The shared reward pool is…</Text>
                  <View style={styles.amountRow}>
                    <Text aria-hidden style={styles.currencySymbol}>$</Text>
                    <TextInput
                      ref={inputRef}
                      accessibilityLabel="Total stake in dollars"
                      inputMode="numeric"
                      keyboardType="number-pad"
                      maxLength={MAX_STAKE_INPUT_LENGTH}
                      onChangeText={updateStakeAmount}
                      placeholder="0"
                      placeholderTextColor={theme.colors.warmGrey}
                      selectionColor={theme.colors.copperBright}
                      style={styles.amountInput}
                      value={stakeAmountInput}
                    />
                  </View>
                  <Text style={styles.stakePrinciple}>
                    Choose an amount that would sting to lose.
                  </Text>
                  <Text style={styles.safetyLine}>
                    It should feel painful, but never financially unsafe.
                  </Text>
                  <Text style={styles.poolHelper}>
                    {formattedStake
                      ? `${formattedStake} total for ${recipientCount} ${recipientLabel}—not ${formattedStake} per person.`
                      : `One total dollar amount for ${recipientCount} ${recipientLabel}—not an amount per person.`}
                  </Text>
                </View>
              </View>

              <View
                accessibilityLiveRegion="polite"
                style={styles.outcomeSummary}
              >
                <View style={styles.outcomeRow}>
                  <Text style={styles.outcomeLabel}>IF YOU SUCCEED</Text>
                  <Text style={styles.outcomeText}>Nothing is charged.</Text>
                </View>
                <View style={[styles.outcomeRow, styles.failureOutcome]}>
                  <Text style={styles.failureLabel}>IF THE CHALLENGE FAILS</Text>
                  <Text style={styles.outcomeText}>
                    {experienceCategory && stakeAmount
                      ? `${formattedStake} becomes one shared ${selectedCategory?.label.toLowerCase()} reward pool. ${organizerName || 'The organizer'} arranges it, and you sit it out.`
                      : 'Your total stake becomes one shared, category-restricted reward pool. The organizer arranges it, and you sit it out.'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <View style={styles.confirmationSlot}>
                <Animated.View
                  accessibilityElementsHidden={!experienceCaptured}
                  accessibilityLiveRegion="polite"
                  importantForAccessibility={
                    experienceCaptured ? 'yes' : 'no-hide-descendants'
                  }
                  style={[styles.confirmationPanel, confirmationStyle]}
                >
                  {experienceCaptured && (
                    <>
                      <View aria-hidden style={styles.confirmationNode} />
                      <Text style={styles.confirmation}>
                        Experience and stake captured. Next, we’ll review the promise.
                      </Text>
                    </>
                  )}
                </Animated.View>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint={
                  canContinue
                    ? 'Continues to review both possible futures'
                    : 'Choose an experience and enter a total dollar amount greater than zero'
                }
                disabled={!canContinue || experienceCaptured}
                label="Continue"
                onPress={continueWithExperience}
                reducedMotion={reducedMotion}
              />
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardAvoidingView: { flex: 1 },
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
  main: { gap: 22, paddingTop: 12 },
  intro: { gap: 8 },
  phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 38, fontWeight: '400', letterSpacing: -0.6, lineHeight: 44,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  secondaryCopy: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  categorySection: { position: 'relative', paddingLeft: 18 },
  categoryThread: {
    position: 'absolute', top: 27, bottom: 13, left: 6, width: 1,
    backgroundColor: theme.colors.copper, opacity: 0.7,
  },
  sectionLabel: {
    marginBottom: 10, color: theme.colors.copper,
    fontSize: 9, fontWeight: '800', letterSpacing: 1.45,
  },
  categoryList: { gap: 7 },
  categoryChoice: {
    minHeight: 63, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingRight: 14,
  },
  selectedCategoryChoice: {
    borderTopColor: theme.colors.copperBright,
    borderBottomColor: theme.colors.copper,
    backgroundColor: theme.colors.surfaceRaised,
  },
  choicePressed: { backgroundColor: theme.colors.surfaceFocused },
  anchorColumn: { width: 42, alignItems: 'center', justifyContent: 'center' },
  anchor: {
    width: 12, height: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: 6, backgroundColor: theme.colors.deepInk,
  },
  selectedAnchor: { width: 15, height: 15, borderRadius: 8, borderColor: theme.colors.copperBright },
  anchorCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.warmGrey },
  selectedAnchorCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  categoryCopy: { flex: 1, paddingVertical: 9 },
  categoryLabel: { color: theme.colors.boneMuted, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  selectedCategoryLabel: { color: theme.colors.bone },
  categoryDescription: { marginTop: 2, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  selectedCategoryDescription: { color: theme.colors.boneMuted },
  selectionRule: { width: 18, height: 1, backgroundColor: 'transparent' },
  selectedRule: { width: 34, backgroundColor: theme.colors.copperBright },
  stakeSection: { position: 'relative', paddingLeft: 18 },
  stakeConnector: {
    position: 'absolute', top: -23, left: 6, width: 1, height: 39,
    backgroundColor: theme.colors.copper, opacity: 0.76,
  },
  stakeAnchor: {
    position: 'absolute', top: 8, left: 0, width: 13, height: 13,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: theme.colors.copperBright, borderRadius: 7,
    backgroundColor: theme.colors.copperDeep,
  },
  stakeAnchorCore: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  stakeSurface: {
    borderTopWidth: 1, borderBottomWidth: 1,
    borderTopColor: theme.colors.copperBright, borderBottomColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 18, paddingVertical: 15,
    overflow: 'hidden',
  },
  stakeLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  amountRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  currencySymbol: {
    width: 30, color: theme.colors.copperBright,
    fontSize: 28, fontWeight: '700', lineHeight: 36,
  },
  amountInput: {
    flex: 1, minWidth: 0, minHeight: 62, color: theme.colors.bone,
    fontSize: 36, fontWeight: '500', letterSpacing: -0.4,
    paddingHorizontal: 0, paddingVertical: 7,
  },
  stakePrinciple: { color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  safetyLine: { marginTop: 2, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  poolHelper: { marginTop: 7, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  outcomeSummary: {
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 16,
  },
  outcomeRow: { paddingVertical: 12 },
  failureOutcome: { borderTopWidth: 1, borderTopColor: theme.colors.structureLine },
  outcomeLabel: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  failureLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  outcomeText: { marginTop: 5, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  footer: { marginTop: 'auto', paddingTop: 24 },
  confirmationSlot: { minHeight: 46, justifyContent: 'center', paddingBottom: 8 },
  confirmationPanel: {
    minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.copper,
    paddingHorizontal: 4, paddingVertical: 8,
  },
  confirmationNode: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  confirmation: { flex: 1, color: theme.colors.boneMuted, fontSize: 13, lineHeight: 19 },
});
