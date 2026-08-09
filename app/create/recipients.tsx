import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { createRecipientDraft, RecipientDraft, useOnboarding } from '@/contexts/onboarding-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playSelectionHaptic } from '@/lib/haptics';

const MAX_RECIPIENTS = 4;
const MAX_NAME_LENGTH = 50;

export default function CreateRecipientsScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const otherNameRef = useRef<TextInput>(null);
  const { recipients, rewardOrganizer, setRecipients, setRewardOrganizer } = useOnboarding();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const visibleNamesAreValid = recipients.every((recipient) => recipient.name.trim().length > 0 && recipient.name.length <= MAX_NAME_LENGTH);
  const recipientsAreValid = recipients.length >= 1 && recipients.length <= MAX_RECIPIENTS && visibleNamesAreValid;
  const selectedRecipientExists =
    rewardOrganizer?.type === 'recipient' &&
    recipients.some((recipient) => recipient.id === rewardOrganizer.recipientId && recipient.name.trim().length > 0);
  const otherNameIsValid = rewardOrganizer?.type === 'other' && rewardOrganizer.name.trim().length > 0;
  const canContinue = recipientsAreValid && Boolean(selectedRecipientExists || otherNameIsValid);
  const recipientChoices = recipients.filter((recipient) => recipient.name.trim().length > 0);

  const updateRecipientName = (id: string, name: string) => {
    setRecipients((current) => current.map((recipient) => (recipient.id === id ? { ...recipient, name } : recipient)));
  };

  const addRecipient = () => {
    if (recipients.length >= MAX_RECIPIENTS) return;
    void playSelectionHaptic();
    setRecipients((current) => (current.length < MAX_RECIPIENTS ? [...current, createRecipientDraft()] : current));
  };

  const removeRecipient = (id: string) => {
    if (recipients[0]?.id === id || recipients.length <= 1) return;
    void playSelectionHaptic();
    setRecipients((current) => current.filter((recipient) => recipient.id !== id));
    if (rewardOrganizer?.type === 'recipient' && rewardOrganizer.recipientId === id) {
      setRewardOrganizer(null);
    }
  };

  const selectRecipientOrganizer = (recipientId: string) => {
    void playSelectionHaptic();
    setRewardOrganizer({ type: 'recipient', recipientId });
  };

  const selectOtherOrganizer = () => {
    void playSelectionHaptic();
    const existingName = rewardOrganizer?.type === 'other' ? rewardOrganizer.name : '';
    setRewardOrganizer({ type: 'other', name: existingName });
    setTimeout(() => otherNameRef.current?.focus(), 0);
  };

  const updateOtherName = (name: string) => setRewardOrganizer({ type: 'other', name });

  const continueToReview = () => {
    if (!canContinue) return;
    Keyboard.dismiss();
    router.push('/create/review');
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to the consequence"
      currentStep={6}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to review' : 'Name your recipients and choose an organizer before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToReview}
          reducedMotion={reducedMotion}
        />
      }
      headline="Who gets the reward?"
      onBack={() => router.back()}
      progressLabel="Step 6 of 7: loved ones"
      totalSteps={7}
    >
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>RECIPIENTS</Text>
        <View style={styles.recipientList}>
          {recipients.map((recipient: RecipientDraft, index: number) => (
            <View key={recipient.id} style={[styles.recipientRow, focusedId === recipient.id && styles.recipientRowFocused]}>
              <View style={styles.recipientHeader}>
                <Text style={styles.recipientLabel}>PERSON {index + 1}</Text>
                {index > 0 && (
                  <Pressable
                    accessibilityHint="Removes this recipient"
                    accessibilityLabel={`Remove ${recipient.name.trim() || `Person ${index + 1}`}`}
                    accessibilityRole="button"
                    hitSlop={7}
                    onPress={() => removeRecipient(recipient.id)}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                accessibilityLabel={`Person ${index + 1}`}
                autoCapitalize="words"
                maxLength={MAX_NAME_LENGTH}
                onBlur={() => setFocusedId(null)}
                onChangeText={(name) => updateRecipientName(recipient.id, name)}
                onFocus={() => setFocusedId(recipient.id)}
                placeholder="Their name"
                placeholderTextColor={theme.colors.warmGrey}
                selectionColor={theme.colors.crimsonBright}
                style={styles.recipientInput}
                value={recipient.name}
              />
            </View>
          ))}
        </View>
        {recipients.length < MAX_RECIPIENTS && (
          <Pressable accessibilityHint="Adds another recipient" accessibilityLabel="Add another person" accessibilityRole="button" onPress={addRecipient} style={styles.addAction}>
            <Text style={styles.addText}>+ Add another person</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ORGANIZER</Text>
        <View style={styles.organizerList}>
          {recipientChoices.map((recipient) => {
            const selected = rewardOrganizer?.type === 'recipient' && rewardOrganizer.recipientId === recipient.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={recipient.id}
                onPress={() => selectRecipientOrganizer(recipient.id)}
                style={[styles.organizerChoice, selected && styles.organizerChoiceSelected]}
              >
                <Text style={[styles.organizerLabel, selected && styles.organizerLabelSelected]}>{recipient.name.trim()}</Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: rewardOrganizer?.type === 'other' }}
            onPress={selectOtherOrganizer}
            style={[styles.organizerChoice, rewardOrganizer?.type === 'other' && styles.organizerChoiceSelected]}
          >
            <Text style={[styles.organizerLabel, rewardOrganizer?.type === 'other' && styles.organizerLabelSelected]}>Someone else</Text>
          </Pressable>
        </View>
        {rewardOrganizer?.type === 'other' && (
          <TextInput
            ref={otherNameRef}
            accessibilityLabel="Organizer's name"
            autoCapitalize="words"
            maxLength={MAX_NAME_LENGTH}
            onChangeText={updateOtherName}
            placeholder="Their name"
            placeholderTextColor={theme.colors.warmGrey}
            selectionColor={theme.colors.crimsonBright}
            style={styles.otherNameInput}
            value={rewardOrganizer.name}
          />
        )}
      </View>
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionLabel: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  recipientList: { gap: 8 },
  recipientRow: {
    borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.structureLine,
    backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8,
  },
  recipientRowFocused: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.surfaceRaised },
  recipientHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recipientLabel: { color: theme.colors.crimsonBright, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  removeText: { color: theme.colors.warmGrey, fontSize: 11, fontWeight: '600' },
  recipientInput: { marginTop: 4, minHeight: 32, color: theme.colors.ivory, fontSize: 18, fontWeight: '500', paddingHorizontal: 0, paddingVertical: 0 },
  addAction: { minHeight: 44, justifyContent: 'center' },
  addText: { color: theme.colors.crimsonBright, fontSize: 14, fontWeight: '700' },
  organizerList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  organizerChoice: {
    minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 1,
    borderColor: theme.colors.structureLineStrong, paddingHorizontal: 16,
  },
  organizerChoiceSelected: { borderColor: theme.colors.crimson, backgroundColor: theme.colors.crimsonSurface },
  organizerLabel: { color: theme.colors.ivoryMuted, fontSize: 14, fontWeight: '600' },
  organizerLabelSelected: { color: theme.colors.ivory },
  otherNameInput: {
    minHeight: 46, borderRadius: theme.radius.controlled, borderWidth: 1, borderColor: theme.colors.crimson,
    backgroundColor: theme.colors.surfaceRaised, color: theme.colors.ivory, fontSize: 17,
    paddingHorizontal: 16, paddingVertical: 0,
  },
});
