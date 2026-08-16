import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { SecondaryButtonV2 } from '@/components/v2/secondary-button';
import { TextInputV2 } from '@/components/v2/text-input';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { ChallengePeriod } from '@/domain/challenge/periods';
import { CheckInFact, ClientOperationId } from '@/domain/challenge/check-in/types';
import { ActivatedChallengeSnapshot, IsoDateTime } from '@/domain/challenge/types';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { describeCorrectionFailure } from '@/lib/check-in-correction';
import { CorrectionAction, isBinaryDailyTarget } from '@/lib/challenge-ux-preview/view-model';
import { playImportantHaptic } from '@/lib/haptics';
import { submitCheckIn } from '@/lib/supabase/active-challenge-repository';

type ResolvedCorrectionAction = Extract<CorrectionAction, { readonly available: true }>;

type CorrectionSheetProps = {
  challenge: ActivatedChallengeSnapshot;
  correctionAction: ResolvedCorrectionAction;
  onClose: () => void;
  onSubmitted: () => void;
  period: ChallengePeriod;
};

type Step = 'ask' | 'submitting' | 'done' | { readonly kind: 'error'; readonly message: string; readonly retryable: boolean };

function initialCountInput(fact: CheckInFact): string {
  if (fact.kind === 'build_completion') return String(fact.completions);
  if (fact.kind === 'cut_back_total') return String(fact.total);
  return '';
}

/**
 * Corrects the currently effective report for the current focus period —
 * never a browsable history of every past period. Reuses the trusted
 * `submitCheckIn` -> append-check-in-event path verbatim (isCorrection:
 * true, correctionOfEventId from the already-resolved, unambiguous
 * `correctionAction.target` — never a client-picked event id): the server
 * remains the sole authority on whether a correction is accepted, exactly
 * like an ordinary check-in. `operationId` is minted once per sheet
 * instance (lazy useState initializer, never regenerated on retry) and
 * every retry resubmits the exact `CheckInFact` last attempted (tracked in
 * `attemptedFact`, not re-derived from current input state) — a "Try
 * again" after a network hiccup replays the same logical attempt, not a
 * fresh guess.
 */
export function RealCheckInCorrectionSheetV2({ challenge, correctionAction, onClose, onSubmitted, period }: CorrectionSheetProps) {
  const reducedMotion = useReducedMotion();
  const [operationId] = useState(() => Crypto.randomUUID() as ClientOperationId);
  const [step, setStep] = useState<Step>('ask');
  const [countInput, setCountInput] = useState(() => initialCountInput(correctionAction.target.fact));
  const [attemptedFact, setAttemptedFact] = useState<CheckInFact | null>(null);

  const behavior = challenge.behavior.description.trim();
  const submitting = step === 'submitting';

  const submit = async (fact: CheckInFact) => {
    void playImportantHaptic();
    setAttemptedFact(fact);
    setStep('submitting');
    const result = await submitCheckIn({
      challengeId: challenge.id,
      periodId: period.id,
      operationId,
      fact,
      isCorrection: true,
      correctionOfEventId: correctionAction.target.eventId,
      clientRecordedAt: new Date().toISOString() as IsoDateTime,
    });
    if (!result.ok) {
      const { message, retryable } = describeCorrectionFailure(result);
      setStep({ kind: 'error', message, retryable });
      return;
    }
    onSubmitted();
    setStep('done');
  };

  if (typeof step === 'object') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>Could not save that correction.</Text>
        <Text style={styles.supporting}>{step.message}</Text>
        {step.retryable && attemptedFact
          ? <PrimaryButtonV2 accessibilityHint="Tries saving this correction again" label="Try again" onPress={() => void submit(attemptedFact)} reducedMotion={reducedMotion} />
          : null}
        <SecondaryButtonV2 accessibilityHint="Closes this sheet without saving a correction" label="Close" onPress={onClose} />
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>Report corrected.</Text>
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

  return (
    <View style={styles.content}>
      <Text style={styles.behavior}>{behavior}</Text>
      <Text accessibilityRole="header" style={styles.headline}>Correct this report</Text>
      <Text style={styles.supporting}>
        This changes which answer counts for this period. The original check-in stays in your history.
      </Text>
      <CorrectionBody
        correctionAction={correctionAction}
        countInput={countInput}
        onChangeCountInput={setCountInput}
        onSubmit={(fact) => void submit(fact)}
        period={period}
        submitting={submitting}
      />
    </View>
  );
}

function CorrectionBody({
  correctionAction,
  countInput,
  onChangeCountInput,
  onSubmit,
  period,
  submitting,
}: {
  readonly correctionAction: ResolvedCorrectionAction;
  readonly countInput: string;
  readonly onChangeCountInput: (value: string) => void;
  readonly onSubmit: (fact: CheckInFact) => void;
  readonly period: ChallengePeriod;
  readonly submitting: boolean;
}) {
  const reducedMotion = useReducedMotion();

  if (correctionAction.direction === 'stop_lapse_to_intact') {
    return (
      <>
        <Text style={styles.previous}>A lapse is currently on record for this period.</Text>
        <Text accessibilityRole="header" style={styles.question}>Was that recorded by mistake?</Text>
        <PrimaryButtonV2 accessibilityHint="Corrects the lapse and restores this period to kept" disabled={submitting} label="Yes, restore to kept" onPress={() => onSubmit({ kind: 'stop_intact' })} reducedMotion={reducedMotion} />
      </>
    );
  }

  if (correctionAction.direction === 'stop_intact_to_lapse') {
    return (
      <>
        <Text style={styles.previous}>This period is currently recorded as kept.</Text>
        <Text accessibilityRole="header" style={styles.question}>Did you actually slip during this period?</Text>
        <PrimaryButtonV2 accessibilityHint="Corrects this period to a recorded lapse" disabled={submitting} label="Yes, report a lapse" onPress={() => onSubmit({ kind: 'stop_lapse' })} reducedMotion={reducedMotion} />
      </>
    );
  }

  const fact = correctionAction.target.fact;

  if (correctionAction.direction === 'build' && fact.kind === 'build_completion' && isBinaryDailyTarget(period)) {
    const previouslyYes = fact.completions >= 1;
    return (
      <>
        <Text style={styles.previous}>Previously recorded: {previouslyYes ? 'Yes, done' : 'No, not done'}.</Text>
        <PrimaryButtonV2 accessibilityHint="Corrects this to done" disabled={submitting} label="Yes, I did it" onPress={() => onSubmit({ kind: 'build_completion', completions: 1 })} reducedMotion={reducedMotion} />
        <SecondaryButtonV2 accessibilityHint="Corrects this to not done" label="No, I didn't" onPress={() => onSubmit({ kind: 'build_completion', completions: 0 })} />
      </>
    );
  }

  if (correctionAction.direction === 'build') {
    return (
      <CountCorrectionInput
        countInput={countInput}
        label="Corrected count"
        onChangeCountInput={onChangeCountInput}
        onSubmit={(value) => onSubmit({ kind: 'build_completion', completions: Math.round(value) })}
        previousLabel={`Previously recorded: ${fact.kind === 'build_completion' ? fact.completions : 0}`}
        submitting={submitting}
        unit=""
      />
    );
  }

  // cut_back
  const cutBackFact = fact.kind === 'cut_back_total' ? fact : null;
  return (
    <CountCorrectionInput
      countInput={countInput}
      label="Corrected total"
      onChangeCountInput={onChangeCountInput}
      onSubmit={(value) => onSubmit({ kind: 'cut_back_total', total: value, unit: cutBackFact?.unit ?? '' })}
      previousLabel={`Previously recorded: ${cutBackFact ? `${cutBackFact.total} ${cutBackFact.unit}` : '0'}`}
      submitting={submitting}
      unit={cutBackFact?.unit ?? ''}
    />
  );
}

function CountCorrectionInput({
  countInput,
  label,
  onChangeCountInput,
  onSubmit,
  previousLabel,
  submitting,
  unit,
}: {
  readonly countInput: string;
  readonly label: string;
  readonly onChangeCountInput: (value: string) => void;
  readonly onSubmit: (value: number) => void;
  readonly previousLabel: string;
  readonly submitting: boolean;
  readonly unit: string;
}) {
  const reducedMotion = useReducedMotion();
  const parsed = Number(countInput.replace(',', '.'));
  const valid = countInput.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;
  return (
    <>
      <Text style={styles.previous}>{previousLabel}</Text>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.inputRow}>
        <TextInputV2
          accessibilityLabel={label}
          inputMode="decimal"
          keyboardType="decimal-pad"
          onChangeText={onChangeCountInput}
          placeholder="0"
          placeholderTextColor={theme.colors.warmGrey}
          style={styles.input}
          value={countInput}
        />
        {unit ? <Text style={styles.inputUnit}>{unit}</Text> : null}
      </View>
      <PrimaryButtonV2 accessibilityHint="Saves this corrected value" disabled={!valid || submitting} label="Save correction" onPress={() => valid && onSubmit(parsed)} reducedMotion={reducedMotion} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.small, paddingBottom: theme.spacing.small },
  behavior: { color: theme.colors.crimsonBright, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  headline: { color: theme.colors.ivory, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  question: { color: theme.colors.ivory, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  supporting: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  previous: { color: theme.colors.warmGrey, fontSize: 13, lineHeight: 18 },
  label: { color: theme.colors.ivoryMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginTop: 4 },
  inputRow: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 16,
  },
  input: { flex: 1, color: theme.colors.ivory, fontSize: 22, paddingVertical: 10 },
  inputUnit: { color: theme.colors.crimsonBright, fontSize: 14, fontWeight: '700' },
});
