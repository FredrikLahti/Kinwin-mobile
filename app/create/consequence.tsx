import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceListV2 } from '@/components/v2/choice-list';
import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { ExperienceCategory, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';

const MAX_STAKE_INPUT_LENGTH = 7;

const EXPERIENCE_CATEGORIES: { description: string; label: string; value: ExperienceCategory }[] = [
  { description: 'A meal they can share.', label: 'Dinner', value: 'dinner' },
  { description: 'Time to recharge together.', label: 'Wellness', value: 'wellness' },
  { description: 'An active day or new experience.', label: 'Adventure', value: 'adventure' },
  { description: 'A show, exhibition, or event.', label: 'Culture', value: 'culture' },
  { description: 'A short trip or overnight stay.', label: 'Getaway', value: 'getaway' },
];

export default function CreateConsequenceScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const {
    behaviorDirection,
    experienceCategory,
    recipients,
    setExperienceCategory,
    setStakeAmount,
    setStakeAmountInput,
    stakeAmount,
    stakeAmountInput,
  } = useOnboarding();
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'consequence');

  const recipientNames = recipients.map((recipient) => recipient.name.trim()).filter(Boolean);
  const experienceSectionLabel =
    recipientNames.length === 1 ? `EXPERIENCE FOR ${recipientNames[0].toUpperCase()}` : 'THEIR EXPERIENCE';

  const canContinue = Boolean(experienceCategory && stakeAmount && stakeAmount > 0);

  const updateStakeAmount = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, MAX_STAKE_INPUT_LENGTH);
    const numericAmount = digits ? Number(digits) : null;
    setStakeAmountInput(digits);
    setStakeAmount(numericAmount && numericAmount > 0 ? numericAmount : null);
  };

  const continueToReview = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    inputRef.current?.blur();
    router.push('/create/review');
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to loved ones"
      currentStep={currentStep}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to review' : 'Choose an experience and enter a stake greater than zero'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToReview}
          reducedMotion={reducedMotion}
        />
      }
      headline="What’s at stake?"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: consequence`}
      totalSteps={totalSteps}
    >
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{experienceSectionLabel}</Text>
        <ChoiceListV2 onChange={setExperienceCategory} options={EXPERIENCE_CATEGORIES} value={experienceCategory} />
      </View>

      <View style={styles.stakeField}>
        <Text style={styles.stakeLabel}>Total stake</Text>
        <View style={styles.amountRow}>
          <Text aria-hidden style={styles.currencySymbol}>$</Text>
          <TextInput
            ref={inputRef}
            accessibilityLabel="Total stake in dollars"
            keyboardType="number-pad"
            maxLength={MAX_STAKE_INPUT_LENGTH}
            onChangeText={updateStakeAmount}
            placeholder="0"
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.oxblood}
            style={styles.amountInput}
            value={stakeAmountInput}
          />
        </View>
        <Text style={styles.stakeHelper}>Choose an amount that would sting to lose, but never financially unsafe.</Text>
      </View>
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  stakeField: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12,
  },
  stakeLabel: { color: theme.colors.crimsonBright, fontSize: 13, fontWeight: '600' },
  amountRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center' },
  currencySymbol: { color: theme.colors.crimsonBright, fontSize: 26, fontWeight: '700' },
  amountInput: { flex: 1, minHeight: 50, color: theme.colors.ivory, fontSize: 34, fontWeight: '600', paddingHorizontal: 4, paddingVertical: 0 },
  stakeHelper: { marginTop: 8, color: theme.colors.warmGrey, fontSize: 11, lineHeight: 16 },
});
