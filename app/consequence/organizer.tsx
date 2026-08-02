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
import {
  RecipientDraft,
  RewardOrganizer,
  useOnboarding,
} from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const MAX_NAME_LENGTH = 50;

type OrganizerChoiceProps = {
  description: string;
  label: string;
  onPress: () => void;
  selected: boolean;
};

function OrganizerChoice({
  description,
  label,
  onPress,
  selected,
}: OrganizerChoiceProps) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={3}
      onPress={onPress}
      style={({ pressed }) => [
        styles.organizerChoice,
        selected && styles.selectedOrganizerChoice,
        pressed && styles.choicePressed,
      ]}
    >
      <View aria-hidden style={styles.choiceAnchorColumn}>
        <View style={[styles.choiceAnchor, selected && styles.selectedChoiceAnchor]}>
          <View style={[styles.choiceAnchorCore, selected && styles.selectedChoiceAnchorCore]} />
        </View>
      </View>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceLabel, selected && styles.selectedChoiceLabel]}>
          {label}
        </Text>
        <Text style={[styles.choiceDescription, selected && styles.selectedChoiceDescription]}>
          {description}
        </Text>
      </View>
      <Text aria-hidden style={[styles.choiceMark, selected && styles.selectedChoiceMark]}>
        {selected ? '✓' : '→'}
      </Text>
    </Pressable>
  );
}

export default function OrganizerScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();
  const { recipients, rewardOrganizer, setRewardOrganizer } = useOnboarding();
  const [organizerCaptured, setOrganizerCaptured] = useState(false);
  const revealProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const otherSurfaceProgress = useSharedValue(rewardOrganizer?.type === 'other' ? 1 : 0);
  const confirmationProgress = useSharedValue(0);

  const selectedRecipientExists =
    rewardOrganizer?.type === 'recipient' &&
    recipients.some(
      (recipient) =>
        recipient.id === rewardOrganizer.recipientId && recipient.name.trim().length > 0,
    );
  const otherNameIsValid =
    rewardOrganizer?.type === 'other' && rewardOrganizer.name.trim().length > 0;
  const canContinue = Boolean(selectedRecipientExists || otherNameIsValid);

  useEffect(() => {
    revealProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [reducedMotion, revealProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      otherSurfaceProgress.value = rewardOrganizer?.type === 'other' ? 1 : 0;
      return;
    }

    otherSurfaceProgress.value = withTiming(rewardOrganizer?.type === 'other' ? 1 : 0, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [otherSurfaceProgress, reducedMotion, rewardOrganizer?.type]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      confirmationProgress.value = organizerCaptured ? 1 : 0;
      return;
    }

    confirmationProgress.value = withTiming(organizerCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
  }, [confirmationProgress, organizerCaptured, reducedMotion]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - revealProgress.value) * 10 },
    ],
  }));

  const otherSurfaceStyle = useAnimatedStyle(() => ({
    opacity: otherSurfaceProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - otherSurfaceProgress.value) * 7 },
    ],
  }));

  const confirmationStyle = useAnimatedStyle(() => ({
    opacity: confirmationProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - confirmationProgress.value) * 6 },
    ],
  }));

  const selectOrganizer = (organizer: RewardOrganizer) => {
    void playSelectionHaptic();
    setRewardOrganizer(organizer);
    setOrganizerCaptured(false);
  };

  const selectOtherOrganizer = () => {
    const existingName = rewardOrganizer?.type === 'other' ? rewardOrganizer.name : '';
    selectOrganizer({ type: 'other', name: existingName });

    if (Platform.OS !== 'web') {
      setTimeout(() => inputRef.current?.focus(), reducedMotion ? 0 : theme.motion.standard);
    }
  };

  const updateOtherName = (name: string) => {
    setRewardOrganizer({ type: 'other', name });
    setOrganizerCaptured(false);
  };

  const continueWithOrganizer = () => {
    if (!canContinue || organizerCaptured) return;
    Keyboard.dismiss();
    inputRef.current?.blur();
    void playImportantHaptic();
    setOrganizerCaptured(false);
    router.push('/consequence/experience');
  };

  const recipientChoices = recipients.filter((recipient) => recipient.name.trim().length > 0);

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
                  accessibilityHint="Returns to the recipient step"
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.dismissTo('/consequence/recipients')}
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
                2 of 4
              </Text>
            </View>

            <OnboardingProgress
              accessibilityLabel="Consequence setup, step 2 of 4"
              currentStep={2}
              reducedMotion={reducedMotion}
              settled={organizerCaptured}
              totalSteps={4}
            />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text style={styles.phaseLabel}>REWARD ORGANIZER</Text>
                <Text style={styles.headline}>Who will organize the reward?</Text>
                <Text style={styles.supportingCopy}>
                  Choose one adult who can receive the reward information and arrange the
                  experience for the group.
                </Text>
                <Text style={styles.secondaryCopy}>
                  They won’t be asked to pay. Contact details come later.
                </Text>
              </View>

              <View style={styles.selectionSection}>
                <View aria-hidden style={styles.organizerThread} />
                <Text style={styles.sectionLabel}>CHOOSE FROM YOUR RECIPIENTS</Text>
                <View style={styles.choiceList}>
                  {recipientChoices.map((recipient: RecipientDraft) => (
                    <OrganizerChoice
                      key={recipient.id}
                      description="Receives the experience and helps arrange it for the group."
                      label={recipient.name.trim()}
                      onPress={() =>
                        selectOrganizer({
                          type: 'recipient',
                          recipientId: recipient.id,
                        })
                      }
                      selected={
                        rewardOrganizer?.type === 'recipient' &&
                        rewardOrganizer.recipientId === recipient.id
                      }
                    />
                  ))}
                </View>

                <View style={styles.alternativeDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.alternativeLabel}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <OrganizerChoice
                  description="An adult who helps organize without receiving the experience."
                  label="Someone else"
                  onPress={selectOtherOrganizer}
                  selected={rewardOrganizer?.type === 'other'}
                />

                {rewardOrganizer?.type === 'other' && (
                  <Animated.View style={[styles.otherNameSurface, otherSurfaceStyle]}>
                    <View aria-hidden style={styles.surfaceAnchor}>
                      <View style={styles.surfaceAnchorCore} />
                    </View>
                    <Text style={styles.inputLabel}>ORGANIZER’S NAME</Text>
                    <TextInput
                      ref={inputRef}
                      accessibilityLabel="Organizer’s name"
                      autoCapitalize="words"
                      autoComplete="name"
                      maxLength={MAX_NAME_LENGTH}
                      onChangeText={updateOtherName}
                      placeholder="Their name"
                      placeholderTextColor={theme.colors.warmGrey}
                      selectionColor={theme.colors.copperBright}
                      style={styles.nameInput}
                      value={rewardOrganizer.name}
                    />
                    <Text style={styles.inputHelper}>
                      This person organizes the reward but isn’t one of its recipients.
                    </Text>
                  </Animated.View>
                )}
              </View>
            </View>

            <View style={styles.footer}>
              <View style={styles.confirmationSlot}>
                <Animated.View
                  accessibilityElementsHidden={!organizerCaptured}
                  accessibilityLiveRegion="polite"
                  importantForAccessibility={
                    organizerCaptured ? 'yes' : 'no-hide-descendants'
                  }
                  style={[styles.confirmationPanel, confirmationStyle]}
                >
                  {organizerCaptured && (
                    <>
                      <View aria-hidden style={styles.confirmationNode} />
                      <Text style={styles.confirmation}>
                        Organizer captured. Contact details come later.
                      </Text>
                    </>
                  )}
                </Animated.View>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint={
                  canContinue
                    ? 'Continues to choose the shared experience and total stake'
                    : 'Choose a recipient or enter another adult organizer’s name'
                }
                disabled={!canContinue || organizerCaptured}
                label="Continue"
                onPress={continueWithOrganizer}
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
  selectionSection: { position: 'relative', paddingLeft: 18 },
  organizerThread: {
    position: 'absolute', top: 22, bottom: 20, left: 6, width: 1,
    backgroundColor: theme.colors.copper, opacity: 0.72,
  },
  sectionLabel: {
    marginBottom: 10, color: theme.colors.copper, fontSize: 9,
    fontWeight: '800', letterSpacing: 1.45,
  },
  choiceList: { gap: 8 },
  organizerChoice: {
    minHeight: 76, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingRight: 12,
  },
  selectedOrganizerChoice: {
    borderTopColor: theme.colors.copperBright,
    borderBottomColor: theme.colors.copper,
    backgroundColor: theme.colors.surfaceRaised,
  },
  choicePressed: { backgroundColor: theme.colors.surfaceFocused },
  choiceAnchorColumn: { width: 42, alignItems: 'center', justifyContent: 'center' },
  choiceAnchor: {
    width: 13, height: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong,
    borderRadius: 7, backgroundColor: theme.colors.deepInk,
  },
  selectedChoiceAnchor: { width: 16, height: 16, borderRadius: 8, borderColor: theme.colors.copperBright },
  choiceAnchorCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.warmGrey },
  selectedChoiceAnchorCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  choiceCopy: { flex: 1, paddingVertical: 12 },
  choiceLabel: { color: theme.colors.boneMuted, fontSize: 16, fontWeight: '700', lineHeight: 21 },
  selectedChoiceLabel: { color: theme.colors.bone },
  choiceDescription: { marginTop: 3, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
  selectedChoiceDescription: { color: theme.colors.boneMuted },
  choiceMark: { width: 28, color: theme.colors.structureLineStrong, fontSize: 17, textAlign: 'center' },
  selectedChoiceMark: { color: theme.colors.copperBright },
  alternativeDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.structureLine },
  alternativeLabel: { color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  otherNameSurface: {
    position: 'relative', minHeight: 126, marginTop: 10,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderTopColor: theme.colors.copperBright, borderBottomColor: theme.colors.structureLineStrong,
    backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 18, paddingVertical: 15,
  },
  surfaceAnchor: {
    position: 'absolute', top: 19, left: -7, width: 13, height: 13,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: theme.colors.copperBright, borderRadius: 7,
    backgroundColor: theme.colors.copperDeep,
  },
  surfaceAnchorCore: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  inputLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  nameInput: {
    minHeight: 46, color: theme.colors.bone, fontSize: 21, fontWeight: '500',
    paddingHorizontal: 0, paddingVertical: 7,
  },
  inputHelper: { color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
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
