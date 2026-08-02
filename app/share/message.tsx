import { Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
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
import { calculateSuccessRule } from '@/lib/success-rule';

const MAX_MESSAGE_LENGTH = 1000;

const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  adventure: 'adventure',
  culture: 'culture',
  dinner: 'dinner',
  getaway: 'getaway',
  wellness: 'wellness',
};

function formatNames(names: string[]) {
  if (names.length === 0) return 'your recipients';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export default function ShareMessageScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const {
    experienceCategory,
    invitationMessage,
    invitationMessageCustomized,
    recipients,
    rewardOrganizer,
    setInvitationMessage,
    setInvitationMessageCustomized,
    stakeAmount,
  } = onboarding;
  const revealProgress = useSharedValue(Platform.OS === 'web' ? 1 : 0);

  const successRule = calculateSuccessRule(onboarding);
  const recipientNames = recipients
    .map((recipient) => recipient.name.trim())
    .filter(Boolean);
  const recipientNamesText = formatNames(recipientNames);
  const organizerName =
    rewardOrganizer?.type === 'recipient'
      ? recipients.find((recipient) => recipient.id === rewardOrganizer.recipientId)?.name.trim()
      : rewardOrganizer?.name.trim();
  const challengeText = successRule?.challengeSummary
    ? successRule.challengeSummary.replaceAll(' · ', ', ')
    : onboarding.behaviorText.trim() || 'the challenge I’ve defined';
  const categoryText = experienceCategory
    ? CATEGORY_LABELS[experienceCategory]
    : 'shared';
  const stakeText = stakeAmount
    ? `my $${stakeAmount.toLocaleString('en-US')} stake`
    : 'my stake';
  const recipientPronoun = recipientNames.length === 1 ? 'you' : 'you all';
  const suggestedMessage =
    `Hi! I’m starting a Kinwin challenge: ${challengeText}.\n\n` +
    `If I don’t keep my promise, ${recipientPronoun} could receive a shared ${categoryText} experience funded by ${stakeText}. ` +
    `${organizerName || 'The adult organizer'} will organize it, and I’ll sit it out. You won’t be asked to pay for anything.\n\n` +
    `I’ll send the Kinwin link myself next. This message really is from me—call me first if you’d rather check.`;

  const canContinue = invitationMessage.trim().length > 0;

  useEffect(() => {
    revealProgress.value = withTiming(1, {
      duration: reducedMotion ? 0 : theme.motion.standard,
    });
  }, [reducedMotion, revealProgress]);

  useEffect(() => {
    if (!invitationMessageCustomized && invitationMessage !== suggestedMessage) {
      setInvitationMessage(suggestedMessage);
    }
  }, [
    invitationMessage,
    invitationMessageCustomized,
    setInvitationMessage,
    suggestedMessage,
  ]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - revealProgress.value) * 10 },
    ],
  }));

  const updateMessage = (message: string) => {
    setInvitationMessage(message);
    setInvitationMessageCustomized(true);
  };

  const useSuggestedMessage = () => {
    void playSelectionHaptic();
    setInvitationMessage(suggestedMessage);
    setInvitationMessageCustomized(false);
  };

  const continueWithMessage = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    inputRef.current?.blur();
    void playImportantHaptic();
    router.push('/share/preview' as Href);
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
                  accessibilityHint="Returns to the Two Futures review"
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.dismissTo('/consequence/review')}
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
                1 of 3
              </Text>
            </View>

            <OnboardingProgress
              accessibilityLabel="Share setup, step 1 of 3"
              currentStep={1}
              reducedMotion={reducedMotion}
              settled={false}
              totalSteps={3}
            />

            <View style={styles.main}>
              <View style={styles.intro}>
                <Text style={styles.phaseLabel}>SHARE SETUP</Text>
                <Text style={styles.headline}>Make the invitation feel like you.</Text>
                <Text style={styles.supportingCopy}>
                  You’ll send this from your own messaging app, so it arrives from a name they
                  trust.
                </Text>
                <Text style={styles.secondaryCopy}>
                  Call first if that would make the invitation feel clearer or safer.
                </Text>
              </View>

              <View style={styles.senderNote}>
                <View aria-hidden style={styles.senderNode} />
                <View style={styles.senderCopy}>
                  <Text style={styles.sectionLabel}>FROM YOU, NOT KINWIN</Text>
                  <Text style={styles.senderText}>
                    A familiar message makes a valuable reward feel credible—not like phishing
                    or a hacked account.
                  </Text>
                </View>
              </View>

              <View style={styles.recipientLine}>
                <Text style={styles.recipientLabel}>PREPARED FOR</Text>
                <Text numberOfLines={2} style={styles.recipientNames}>
                  {recipientNamesText}
                </Text>
              </View>

              <View style={styles.messageSection}>
                <View aria-hidden style={styles.messageThread} />
                <View aria-hidden style={styles.messageAnchor}>
                  <View style={styles.messageAnchorCore} />
                </View>
                <View style={styles.messageHeader}>
                  <View>
                    <Text style={styles.sectionLabel}>YOUR MESSAGE</Text>
                    <Text style={styles.messageState}>
                      {invitationMessageCustomized ? 'Your edited version' : 'Suggested draft'}
                    </Text>
                  </View>
                  {invitationMessageCustomized && (
                    <Pressable
                      accessibilityHint="Replaces your edits with Kinwin’s current suggested draft"
                      accessibilityLabel="Use suggested message"
                      accessibilityRole="button"
                      hitSlop={6}
                      onPress={useSuggestedMessage}
                      style={({ pressed }) => [
                        styles.resetAction,
                        pressed && styles.resetActionPressed,
                      ]}
                    >
                      <Text style={styles.resetText}>Use suggested</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.messageSurface}>
                  <TextInput
                    ref={inputRef}
                    accessibilityLabel="Invitation message"
                    maxLength={MAX_MESSAGE_LENGTH}
                    multiline
                    onChangeText={updateMessage}
                    placeholder="Write a personal invitation message"
                    placeholderTextColor={theme.colors.warmGrey}
                    selectionColor={theme.colors.copperBright}
                    style={styles.messageInput}
                    textAlignVertical="top"
                    value={invitationMessage}
                  />
                  <Text style={styles.characterCount}>
                    {invitationMessage.length} / {MAX_MESSAGE_LENGTH}
                  </Text>
                </View>
              </View>

              <View style={styles.shareSequence}>
                <View aria-hidden style={styles.sequenceThread} />
                <View style={styles.sequenceItem}>
                  <View aria-hidden style={styles.sequenceAnchor} />
                  <View style={styles.sequenceCopy}>
                    <Text style={styles.sequenceLabel}>CALL FIRST, IF IT HELPS</Text>
                    <Text style={styles.sequenceText}>
                      A quick conversation can make the invitation feel natural and safe.
                    </Text>
                  </View>
                </View>
                <View style={styles.sequenceItem}>
                  <View aria-hidden style={styles.sequenceAnchor} />
                  <View style={styles.sequenceCopy}>
                    <Text style={styles.sequenceLabel}>SEND IT YOURSELF</Text>
                    <Text style={styles.sequenceText}>
                      The real message and recipient link will use your usual messaging app later.
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <AnimatedPrimaryButton
                accessibilityHint={
                  canContinue
                    ? 'Continues to preview the future recipient page'
                    : 'Write an invitation message before continuing'
                }
                disabled={!canContinue}
                label="Continue"
                onPress={continueWithMessage}
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
  senderNote: {
    minHeight: 82, flexDirection: 'row', alignItems: 'flex-start',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.structureLine,
    borderLeftWidth: 2, borderLeftColor: theme.colors.copper,
    backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 13,
  },
  senderNode: { width: 7, height: 7, marginTop: 3, marginRight: 12, borderRadius: 4, backgroundColor: theme.colors.copperBright },
  senderCopy: { flex: 1 },
  sectionLabel: { color: theme.colors.copper, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 },
  senderText: { marginTop: 6, color: theme.colors.boneMuted, fontSize: 12, lineHeight: 18 },
  recipientLine: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.structureLine, paddingBottom: 10 },
  recipientLabel: { width: 100, color: theme.colors.warmGrey, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  recipientNames: { flex: 1, color: theme.colors.boneMuted, fontSize: 12, fontWeight: '700', lineHeight: 17, textAlign: 'right' },
  messageSection: { position: 'relative', paddingLeft: 18 },
  messageThread: { position: 'absolute', top: 20, bottom: 0, left: 6, width: 1, backgroundColor: theme.colors.copper, opacity: 0.72 },
  messageAnchor: { position: 'absolute', top: 7, left: 0, width: 13, height: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.copperBright, borderRadius: 7, backgroundColor: theme.colors.copperDeep },
  messageAnchorCore: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.copperBright },
  messageHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  messageState: { marginTop: 4, color: theme.colors.warmGrey, fontSize: 10, lineHeight: 14 },
  resetAction: { minWidth: 108, minHeight: 38, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 5 },
  resetActionPressed: { backgroundColor: theme.colors.surfaceFocused },
  resetText: { color: theme.colors.copperBright, fontSize: 11, fontWeight: '700' },
  messageSurface: { minHeight: 324, borderTopWidth: 1, borderBottomWidth: 1, borderTopColor: theme.colors.copperBright, borderBottomColor: theme.colors.structureLineStrong, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 9 },
  messageInput: { minHeight: 268, color: theme.colors.bone, fontSize: 15, lineHeight: 22, paddingHorizontal: 0, paddingVertical: 0 },
  characterCount: { marginTop: 7, color: theme.colors.warmGrey, fontSize: 10, lineHeight: 14, textAlign: 'right' },
  shareSequence: { position: 'relative', paddingLeft: 18 },
  sequenceThread: { position: 'absolute', top: 8, bottom: 12, left: 6, width: 1, backgroundColor: theme.colors.copper, opacity: 0.6 },
  sequenceItem: { minHeight: 62, flexDirection: 'row', alignItems: 'flex-start' },
  sequenceAnchor: { width: 9, height: 9, marginTop: 3, marginLeft: -16, marginRight: 16, borderRadius: 5, borderWidth: 1, borderColor: theme.colors.copperBright, backgroundColor: theme.colors.deepInk },
  sequenceCopy: { flex: 1 },
  sequenceLabel: { color: theme.colors.copper, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  sequenceText: { marginTop: 4, color: theme.colors.boneMuted, fontSize: 11, lineHeight: 16 },
  footer: { marginTop: 'auto', paddingTop: 24 },
});
