import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { SecondaryButtonV2 } from '@/components/v2/secondary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { ChallengePeriod } from '@/domain/challenge/periods';
import { CheckInFact, ClientOperationId } from '@/domain/challenge/check-in/types';
import { ActivatedChallengeSnapshot, IsoDateTime } from '@/domain/challenge/types';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';
import { submitCheckIn } from '@/lib/supabase/active-challenge-repository';

type RealCheckInSheetV2Props = {
  challenge: ActivatedChallengeSnapshot;
  onClose: () => void;
  onSubmitted: () => void;
  period: ChallengePeriod;
};

type Step = 'ask' | 'confirm_lapse' | 'submitting' | 'done' | 'error';

function isBinaryDailyTarget(period: ChallengePeriod) {
  return period.target.type === 'completion_target' && period.target.target <= 1;
}

/**
 * The real counterpart to components/v2/check-in-sheet.tsx: same compact
 * interaction shapes, but every submission goes through
 * lib/supabase/active-challenge-repository.ts's `submitCheckIn`, which calls
 * the trusted append-check-in-event Edge Function — a real, server-persisted
 * check_in_events row, not a local ChallengePreviewProvider mutation.
 */
export function RealCheckInSheetV2({ challenge, onClose, onSubmitted, period }: RealCheckInSheetV2Props) {
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState<Step>('ask');
  const [errorMessage, setErrorMessage] = useState('');
  const [doneCopy, setDoneCopy] = useState('');
  const [totalInput, setTotalInput] = useState('');

  const direction = challenge.successRule.direction;
  const behavior = challenge.behavior.description.trim();
  const binaryDaily = direction === 'build' && isBinaryDailyTarget(period);
  const unit = period.target.type === 'maximum_value' ? period.target.measurement.unit : '';
  const maximum = period.target.type === 'maximum_value' ? period.target.maximum
    : period.target.type === 'completion_target' ? period.target.target : 0;
  const parsedTotal = Number(totalInput.replace(',', '.'));
  const validTotal = totalInput.trim() !== '' && Number.isFinite(parsedTotal) && parsedTotal >= 0;

  const submit = async (fact: CheckInFact) => {
    void playImportantHaptic();
    setStep('submitting');
    const result = await submitCheckIn({
      challengeId: challenge.id,
      periodId: period.id,
      operationId: Crypto.randomUUID() as ClientOperationId,
      fact,
      isCorrection: false,
      clientRecordedAt: new Date().toISOString() as IsoDateTime,
    });
    if (!result.ok) {
      const message = result.kind === 'rejected' ? describeRejection(result.reason)
        : 'message' in result ? result.message : 'Could not save your check-in.';
      setErrorMessage(message);
      setStep('error');
      return;
    }
    onSubmitted();
    setDoneCopy(describeFact(fact));
    setStep('done');
  };

  if (step === 'error') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>Something went wrong.</Text>
        <Text style={styles.supporting}>{errorMessage}</Text>
        <PrimaryButtonV2 accessibilityHint="Closes this sheet" label="Close" onPress={onClose} reducedMotion={reducedMotion} />
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>{doneCopy}</Text>
        <PrimaryButtonV2 accessibilityHint="Closes this sheet" label="Done" onPress={onClose} reducedMotion={reducedMotion} />
      </View>
    );
  }

  if (step === 'submitting') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.supporting}>Saving…</Text>
      </View>
    );
  }

  if (step === 'confirm_lapse') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>Record a lapse?</Text>
        <Text style={styles.supporting}>This affects the challenge result under the current success rule.</Text>
        <PrimaryButtonV2 accessibilityHint="Confirms and records a lapse" label="Record lapse" onPress={() => void submit({ kind: 'stop_lapse' })} reducedMotion={reducedMotion} />
        <SecondaryButtonV2 accessibilityHint="Goes back without recording anything" label="Go back" onPress={() => { void playSelectionHaptic(); setStep('ask'); }} />
      </View>
    );
  }

  if (direction === 'build') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>
          {binaryDaily ? 'Did you do this today?' : `How many times this ${period.periodKind === 'week' ? 'week' : 'period'}?`}
        </Text>
        {binaryDaily ? (
          <>
            <PrimaryButtonV2 accessibilityHint="Records this as complete" label="Yes" onPress={() => void submit({ kind: 'build_completion', completions: 1 })} reducedMotion={reducedMotion} />
            <SecondaryButtonV2 accessibilityHint="Closes without recording anything" label="Not today" onPress={onClose} />
          </>
        ) : (
          <>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Number of completions"
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={setTotalInput}
                placeholder="0"
                placeholderTextColor={theme.colors.warmGrey}
                style={styles.input}
                value={totalInput}
              />
              <Text style={styles.inputUnit}>of {maximum}</Text>
            </View>
            <PrimaryButtonV2 accessibilityHint="Records this total" disabled={!validTotal} label="Record" onPress={() => void submit({ kind: 'build_completion', completions: Math.round(parsedTotal) })} reducedMotion={reducedMotion} />
          </>
        )}
      </View>
    );
  }

  if (direction === 'cut_back') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>How many {unit} this {period.periodKind === 'week' ? 'week' : 'period'}?</Text>
        <Text style={styles.supporting}>Maximum {maximum} {unit}.</Text>
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel={`Current total in ${unit}`}
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={setTotalInput}
            placeholder="0"
            placeholderTextColor={theme.colors.warmGrey}
            style={styles.input}
            value={totalInput}
          />
          <Text style={styles.inputUnit}>{unit}</Text>
        </View>
        <PrimaryButtonV2 accessibilityHint="Records this total" disabled={!validTotal} label="Record" onPress={() => void submit({ kind: 'cut_back_total', total: parsedTotal, unit })} reducedMotion={reducedMotion} />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <Text style={styles.behavior}>{behavior}</Text>
      <Text accessibilityRole="header" style={styles.headline}>Are you still keeping it?</Text>
      <PrimaryButtonV2 accessibilityHint="Records the promise as intact" label="Still keeping it" onPress={() => void submit({ kind: 'stop_intact' })} reducedMotion={reducedMotion} />
      <SecondaryButtonV2 accessibilityHint="Reports a lapse" label="I slipped" onPress={() => { void playSelectionHaptic(); setStep('confirm_lapse'); }} />
    </View>
  );
}

function describeFact(fact: CheckInFact): string {
  switch (fact.kind) {
    case 'build_completion': return 'Recorded.';
    case 'cut_back_total': return 'Recorded.';
    case 'stop_intact': return 'Promise intact.';
    case 'stop_lapse': return 'Lapse recorded.';
  }
}

function describeRejection(reason: string): string {
  switch (reason) {
    case 'reporting_deadline_passed': return 'The reporting window for this period has closed.';
    case 'unflagged_redeclaration': return 'This period already has a recorded answer.';
    case 'operation_id_conflict': return 'This check-in could not be matched to your last attempt. Please try again.';
    default: return 'This check-in could not be recorded.';
  }
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.small, paddingBottom: theme.spacing.small },
  behavior: { color: theme.colors.crimsonBright, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  headline: { color: theme.colors.ivory, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  supporting: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  inputRow: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 16,
  },
  input: { flex: 1, color: theme.colors.ivory, fontSize: 22, paddingVertical: 10 },
  inputUnit: { color: theme.colors.crimsonBright, fontSize: 14, fontWeight: '700' },
});
