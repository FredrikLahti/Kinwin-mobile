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
  createRecipientDraft,
  RecipientDraft,
  useOnboarding,
} from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

const MAX_RECIPIENTS = 4;
const MAX_NAME_LENGTH = 50;
const USER_BRANCH_COOL = '#788087';
const USER_BRANCH_SURFACE = '#151519';

type RecipientNameFieldProps = {
  index: number;
  onChangeName: (id: string, name: string) => void;
  onFocusChange: (focused: boolean) => void;
  onRemove: (id: string) => void;
  recipient: RecipientDraft;
  reducedMotion: boolean;
  removing: boolean;
};

function RecipientNameField({
  index,
  onChangeName,
  onFocusChange,
  onRemove,
  recipient,
  reducedMotion,
  removing,
}: RecipientNameFieldProps) {
  const appearance = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    appearance.value = withTiming(removing ? 0 : 1, {
      duration: reducedMotion ? 0 : theme.motion.quick,
    });
  }, [appearance, reducedMotion, removing]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: appearance.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - appearance.value) * 7 },
    ],
  }));

  const personLabel = `Person ${index + 1}`;

  return (
    <Animated.View style={[styles.recipientRow, animatedStyle]}>
      <View aria-hidden style={styles.anchorColumn}>
        <View style={styles.recipientAnchor}>
          <View style={styles.recipientAnchorCore} />
        </View>
      </View>
      <View style={styles.nameSurface}>
        <View style={styles.fieldHeader}>
          <Text style={styles.fieldLabel}>PERSON {index + 1}</Text>
          {index > 0 && (
            <Pressable
              accessibilityHint="Removes this person from the other future"
              accessibilityLabel={`Remove ${recipient.name.trim() || personLabel}`}
              accessibilityRole="button"
              disabled={removing}
              hitSlop={7}
              onPress={() => onRemove(recipient.id)}
              style={({ pressed }) => [
                styles.removeAction,
                pressed && styles.controlPressed,
              ]}
            >
              <Text style={styles.removeText}>Remove</Text>
              <Text aria-hidden style={styles.removeMark}>−</Text>
            </Pressable>
          )}
        </View>
        <TextInput
          accessibilityLabel={personLabel}
          autoCapitalize="words"
          autoComplete="name"
          maxLength={MAX_NAME_LENGTH}
          onBlur={() => onFocusChange(false)}
          onChangeText={(name) => onChangeName(recipient.id, name)}
          onFocus={() => onFocusChange(true)}
          placeholder="Their name"
          placeholderTextColor={theme.colors.warmGrey}
          selectionColor={theme.colors.copperBright}
          style={styles.nameInput}
          value={recipient.name}
        />
      </View>
    </Animated.View>
  );
}

export default function RecipientsScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { recipients, setRecipients } = useOnboarding();
  const [recipientsCaptured, setRecipientsCaptured] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const removalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const confirmationProgress = useSharedValue(0);
  const branchFocus = useSharedValue(0.82);
  const anchorProgress = useSharedValue(0.92);

  useEffect(() => {
    revealProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [reducedMotion, revealProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      confirmationProgress.value = recipientsCaptured ? 1 : 0;
      anchorProgress.value = recipientsCaptured ? 1 : 0.92;
      return;
    }

    confirmationProgress.value = withTiming(recipientsCaptured ? 1 : 0, {
      duration: reducedMotion ? 120 : 220,
    });
    anchorProgress.value = withTiming(recipientsCaptured ? 1 : 0.92, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [anchorProgress, confirmationProgress, recipientsCaptured, reducedMotion]);

  useEffect(
    () => () => {
      if (removalTimer.current) clearTimeout(removalTimer.current);
    },
    [],
  );

  const userBranchStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateX: reducedMotion ? 0 : (1 - revealProgress.value) * -8 },
    ],
  }));

  const lovedBranchStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value * (0.78 + branchFocus.value * 0.22),
    transform: [
      { translateX: reducedMotion ? 0 : (1 - revealProgress.value) * 8 },
    ],
  }));

  const lovedThreadStyle = useAnimatedStyle(() => ({
    opacity: 0.56 + branchFocus.value * 0.44,
  }));

  const anchorStyle = useAnimatedStyle(() => ({
    opacity: anchorProgress.value,
    transform: [{ scale: reducedMotion ? 1 : anchorProgress.value }],
  }));

  const confirmationStyle = useAnimatedStyle(() => ({
    opacity: confirmationProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - confirmationProgress.value) * 6 },
    ],
  }));

  const visibleNamesAreValid = recipients.every(
    (recipient) =>
      recipient.name.trim().length > 0 && recipient.name.length <= MAX_NAME_LENGTH,
  );
  const canContinue =
    recipients.length >= 1 &&
    recipients.length <= MAX_RECIPIENTS &&
    visibleNamesAreValid &&
    !removingId;
  const recipientCount = `${recipients.length} ${recipients.length === 1 ? 'person' : 'people'} on the other side`;

  const setRecipientFocus = (focused: boolean) => {
    branchFocus.value = withTiming(focused ? 1 : 0.82, {
      duration: reducedMotion ? 0 : theme.motion.quick,
    });
  };

  const updateRecipientName = (id: string, name: string) => {
    setRecipients((current) =>
      current.map((recipient) =>
        recipient.id === id ? { ...recipient, name } : recipient,
      ),
    );
    setRecipientsCaptured(false);
  };

  const addRecipient = () => {
    if (recipients.length >= MAX_RECIPIENTS || removingId) return;
    void playSelectionHaptic();
    setRecipients((current) =>
      current.length < MAX_RECIPIENTS
        ? [...current, createRecipientDraft()]
        : current,
    );
    setRecipientsCaptured(false);
  };

  const removeRecipient = (id: string) => {
    if (recipients[0]?.id === id || recipients.length <= 1 || removingId) return;
    void playSelectionHaptic();
    setRecipientsCaptured(false);

    if (reducedMotion) {
      setRecipients((current) => current.filter((recipient) => recipient.id !== id));
      return;
    }

    setRemovingId(id);
    removalTimer.current = setTimeout(() => {
      setRecipients((current) => current.filter((recipient) => recipient.id !== id));
      setRemovingId(null);
      removalTimer.current = null;
    }, theme.motion.quick);
  };

  const continueWithRecipients = () => {
    if (!canContinue || recipientsCaptured) return;
    Keyboard.dismiss();
    void playImportantHaptic();
    setRecipientsCaptured(true);
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
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.brandGroup}>
                <Pressable
                  accessibilityHint="Returns to the success rule"
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.dismissTo('/onboarding/success')}
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
                1 of 4
              </Text>
            </View>

            <OnboardingProgress
              accessibilityLabel="Consequence setup, step 1 of 4"
              currentStep={1}
              reducedMotion={reducedMotion}
              settled={recipientsCaptured}
              totalSteps={4}
            />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text style={styles.phaseLabel}>THE OTHER FUTURE</Text>
                <Text style={styles.headline}>Who should win if you don’t?</Text>
                <Text style={styles.supportingCopy}>
                  Choose 1–4 people you care about. If the challenge fails, your stake becomes an
                  experience for them—and your promise is to sit it out.
                </Text>
                <Text style={styles.secondaryCopy}>
                  You’ll choose one adult organizer next.
                </Text>
              </View>

              <View
                accessibilityLabel="Two futures: you keep the change when you succeed; loved ones receive the experience if the challenge fails"
                style={styles.futures}
              >
                <View aria-hidden style={styles.incomingThread} />
                <View aria-hidden style={styles.forkNode} />
                <View aria-hidden style={[styles.branchLine, styles.userBranchLine]} />
                <View aria-hidden style={[styles.branchLine, styles.lovedBranchLine]} />
                <View aria-hidden style={[styles.branchEndpoint, styles.userBranchEndpoint]} />
                <View aria-hidden style={[styles.branchEndpoint, styles.lovedBranchEndpoint]} />
                <View aria-hidden style={[styles.branchStem, styles.userBranchStem]} />
                <View aria-hidden style={[styles.branchStem, styles.lovedBranchStem]} />
                <View style={styles.branchRow}>
                  <Animated.View style={[styles.branch, styles.userBranch, userBranchStyle]}>
                    <Text style={styles.userBranchLabel}>YOU KEEP IT</Text>
                    <Text style={[styles.branchText, styles.userBranchText]}>
                      The change stays with you.
                    </Text>
                  </Animated.View>
                  <Animated.View style={[styles.branch, styles.lovedBranch, lovedBranchStyle]}>
                    <Text style={styles.lovedBranchLabel}>THEY WIN</Text>
                    <Text style={styles.branchText}>Your stake becomes their experience.</Text>
                  </Animated.View>
                </View>
              </View>

              <View style={styles.recipientSection}>
                <Animated.View aria-hidden style={[styles.branchDrop, lovedThreadStyle]} />
                <Animated.View aria-hidden style={[styles.entryBridge, lovedThreadStyle]} />
                <Animated.View aria-hidden style={[styles.recipientThread, lovedThreadStyle]} />
                <View style={styles.recipientRows}>
                  {recipients.map((recipient, index) => (
                    <RecipientNameField
                      key={recipient.id}
                      index={index}
                      onChangeName={updateRecipientName}
                      onFocusChange={setRecipientFocus}
                      onRemove={removeRecipient}
                      recipient={recipient}
                      reducedMotion={reducedMotion}
                      removing={removingId === recipient.id}
                    />
                  ))}
                </View>

                {recipients.length < MAX_RECIPIENTS && (
                  <Pressable
                    accessibilityHint="Adds another recipient name field"
                    accessibilityLabel="Add another person"
                    accessibilityRole="button"
                    disabled={Boolean(removingId)}
                    onPress={addRecipient}
                    style={({ pressed }) => [
                      styles.addAction,
                      pressed && styles.controlPressed,
                    ]}
                  >
                    <View aria-hidden style={styles.addAnchor}>
                      <Text style={styles.addAnchorText}>+</Text>
                    </View>
                    <Text style={styles.addText}>Add another person</Text>
                    <View aria-hidden style={styles.addRule} />
                  </Pressable>
                )}

                <View style={styles.countRow}>
                  <Animated.View aria-hidden style={[styles.countAnchor, anchorStyle]} />
                  <Text accessibilityLiveRegion="polite" style={styles.countText}>
                    {recipientCount}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <View style={styles.confirmationSlot}>
                <Animated.View
                  accessibilityElementsHidden={!recipientsCaptured}
                  accessibilityLiveRegion="polite"
                  importantForAccessibility={
                    recipientsCaptured ? 'yes' : 'no-hide-descendants'
                  }
                  style={[styles.confirmationPanel, confirmationStyle]}
                >
                  {recipientsCaptured && (
                    <>
                      <View aria-hidden style={styles.confirmationNode} />
                      <Text style={styles.confirmation}>
                        Recipients captured. Next, choose who will organize the reward.
                      </Text>
                    </>
                  )}
                </Animated.View>
              </View>
              <AnimatedPrimaryButton
                accessibilityHint={
                  canContinue
                    ? 'Captures these recipients on the current development screen'
                    : 'Enter a name for every visible recipient before continuing'
                }
                disabled={!canContinue || recipientsCaptured}
                label="Continue"
                onPress={continueWithRecipients}
                reducedMotion={reducedMotion}
              />
            </View>
          </View>
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
  main: { gap: 18, paddingTop: 12 },
  intro: { gap: 8 },
  phaseLabel: { color: theme.colors.copper, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  headline: {
    color: theme.colors.bone,
    fontFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
    fontSize: 38, fontWeight: '400', letterSpacing: -0.6, lineHeight: 44,
  },
  supportingCopy: { color: theme.colors.boneMuted, fontSize: 14, lineHeight: 21 },
  secondaryCopy: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
  futures: { position: 'relative', minHeight: 166, paddingTop: 54 },
  incomingThread: {
    position: 'absolute', top: 0, left: '50%', width: 1, height: 19,
    backgroundColor: theme.colors.copper, opacity: 0.76,
  },
  forkNode: {
    position: 'absolute', top: 16, left: '50%', width: 11, height: 11, marginLeft: -5.5,
    borderWidth: 1, borderColor: theme.colors.copperBright,
    borderRadius: 2, backgroundColor: theme.colors.copperDeep,
    transform: [{ rotate: '45deg' }],
  },
  branchLine: { position: 'absolute', top: 21, width: '25%', height: 1 },
  userBranchLine: {
    right: '50%', backgroundColor: USER_BRANCH_COOL,
    transform: [{ rotate: '-11deg' }], transformOrigin: 'right center', opacity: 0.7,
  },
  lovedBranchLine: {
    left: '50%', backgroundColor: theme.colors.copperBright,
    transform: [{ rotate: '11deg' }], transformOrigin: 'left center', opacity: 0.9,
  },
  branchEndpoint: {
    position: 'absolute', top: 42, width: 10, height: 10,
    borderWidth: 1, borderRadius: 5, backgroundColor: theme.colors.deepInk,
  },
  userBranchEndpoint: {
    left: '25%', marginLeft: -5, borderColor: USER_BRANCH_COOL,
  },
  lovedBranchEndpoint: {
    right: '25%', marginRight: -5, borderColor: theme.colors.copperBright,
  },
  branchStem: { position: 'absolute', top: 50, width: 1, height: 5 },
  userBranchStem: { left: '25%', backgroundColor: USER_BRANCH_COOL, opacity: 0.7 },
  lovedBranchStem: { right: '25%', backgroundColor: theme.colors.copperBright },
  branchRow: { flexDirection: 'row', gap: 14 },
  branch: {
    flex: 1, minHeight: 112, borderTopWidth: 1,
    paddingHorizontal: 14, paddingTop: 17, paddingBottom: 14,
  },
  userBranch: {
    borderTopColor: USER_BRANCH_COOL, borderBottomWidth: 1,
    borderBottomColor: theme.colors.structureLine, backgroundColor: USER_BRANCH_SURFACE,
  },
  lovedBranch: {
    borderTopColor: theme.colors.copperBright, borderBottomWidth: 2,
    borderBottomColor: theme.colors.copper, backgroundColor: theme.colors.surfaceRaised,
  },
  userBranchLabel: { color: USER_BRANCH_COOL, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  lovedBranchLabel: { color: theme.colors.copperBright, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  branchText: { marginTop: 8, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  userBranchText: { color: '#99989B' },
  recipientSection: { position: 'relative', paddingTop: 13 },
  branchDrop: {
    position: 'absolute', top: -18, right: '25%', width: 1, height: 19,
    backgroundColor: theme.colors.copperBright,
  },
  entryBridge: {
    position: 'absolute', top: 0, right: '25%', left: 18, height: 1,
    backgroundColor: theme.colors.copper,
  },
  recipientThread: {
    position: 'absolute', top: 0, bottom: 26, left: 18, width: 1,
    backgroundColor: theme.colors.copper, opacity: 0.76,
  },
  recipientRows: { gap: 9 },
  recipientRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center' },
  anchorColumn: { width: 38, alignItems: 'center', justifyContent: 'center' },
  recipientAnchor: {
    width: 13, height: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.copperBright,
    borderRadius: 7, backgroundColor: theme.colors.copperDeep,
  },
  recipientAnchorCore: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  nameSurface: {
    flex: 1, minHeight: 78, justifyContent: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 9,
  },
  fieldHeader: { minHeight: 22, flexDirection: 'row', alignItems: 'center' },
  fieldLabel: { flex: 1, color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  removeAction: {
    minWidth: 64, minHeight: 32, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', gap: 7, paddingHorizontal: 4,
  },
  removeText: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '600' },
  removeMark: { color: theme.colors.copper, fontSize: 17, lineHeight: 18 },
  nameInput: {
    minHeight: 40, color: theme.colors.bone, fontSize: 20, fontWeight: '500',
    paddingHorizontal: 0, paddingVertical: 5,
  },
  controlPressed: { backgroundColor: theme.colors.surfaceFocused },
  addAction: { minHeight: 54, flexDirection: 'row', alignItems: 'center' },
  addAnchor: {
    width: 38, alignItems: 'center', justifyContent: 'center',
  },
  addAnchorText: { color: theme.colors.copperBright, fontSize: 20, fontWeight: '300' },
  addText: { color: theme.colors.boneMuted, fontSize: 14, fontWeight: '600' },
  addRule: { flex: 1, height: 1, marginLeft: 12, backgroundColor: theme.colors.structureLine },
  countRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  countAnchor: { width: 8, height: 8, marginRight: 12, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  countText: { color: theme.colors.warmGrey, fontSize: 12, lineHeight: 18 },
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
