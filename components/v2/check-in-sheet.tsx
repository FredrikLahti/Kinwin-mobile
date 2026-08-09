import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { SecondaryButtonV2 } from '@/components/v2/secondary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useActiveChallengeView } from '@/hooks/use-active-challenge-view';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

type CheckInSheetV2Props = {
  onClose: () => void;
};

type Step = 'ask' | 'confirm_lapse' | 'done';

function periodPhrase(periodUnit: 'day' | 'week' | 'challenge') {
  return periodUnit === 'day' ? 'today' : periodUnit === 'week' ? 'this week' : 'this challenge';
}

function formatValue(value: number, unit: string) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}

export function CheckInSheetV2({ onClose }: CheckInSheetV2Props) {
  const reducedMotion = useReducedMotion();
  const { onboarding, preview, configuration } = useActiveChallengeView();
  const [step, setStep] = useState<Step>('ask');
  const [cutInput, setCutInput] = useState(preview.cutTotal === null ? '' : String(preview.cutTotal));
  const [doneCopy, setDoneCopy] = useState('');

  if (!configuration) return null;

  const { direction, target, unit, measurement, periodUnit } = configuration;
  const behavior = onboarding.behaviorText.trim();
  const isBinaryDaily = direction === 'build' && periodUnit === 'day' && target <= 1;
  const parsedCut = Number(cutInput.replace(',', '.'));
  const validCutInput =
    cutInput.trim() !== '' && Number.isFinite(parsedCut) && parsedCut >= 0 && (measurement !== 'count' || Number.isInteger(parsedCut));

  const buildProgressLine = () => {
    if (direction === 'build') return `${preview.buildCompletions} of ${target} ${periodPhrase(periodUnit)}`;
    if (direction === 'cut') {
      const total = preview.cutTotal ?? 0;
      return `${formatValue(total, unit)} of ${formatValue(target, unit)} ${periodPhrase(periodUnit)}`;
    }
    return preview.stopStatus === 'lapse' ? 'Lapse recorded' : 'Promise intact';
  };

  const finish = (copy: string) => {
    setDoneCopy(copy);
    setStep('done');
  };

  const countBuild = () => {
    if (preview.buildCompletions >= target) return;
    void playImportantHaptic();
    preview.recordBuildCompletion(target);
    finish('Checked in.');
  };

  const skipBuild = () => {
    void playSelectionHaptic();
    onClose();
  };

  const recordCut = () => {
    if (!validCutInput) return;
    void playImportantHaptic();
    preview.recordCutTotal(parsedCut);
    finish(parsedCut <= target ? 'Recorded.' : 'Over the limit.');
  };

  const recordStop = (status: 'intact' | 'lapse') => {
    void playImportantHaptic();
    preview.recordStopStatus(status);
    finish(status === 'intact' ? 'Promise intact.' : 'Lapse recorded.');
  };

  if (step === 'done') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>{doneCopy}</Text>
        <Text style={styles.progressLine}>{buildProgressLine()}</Text>
        <PrimaryButtonV2 accessibilityHint="Closes this sheet" label="Done" onPress={onClose} reducedMotion={reducedMotion} />
      </View>
    );
  }

  if (step === 'confirm_lapse') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>Record a lapse?</Text>
        <Text style={styles.supporting}>This affects the challenge result under the current success rule.</Text>
        <PrimaryButtonV2 accessibilityHint="Confirms and records a lapse" label="Record lapse" onPress={() => recordStop('lapse')} reducedMotion={reducedMotion} />
        <SecondaryButtonV2 accessibilityHint="Goes back without recording anything" label="Go back" onPress={() => { void playSelectionHaptic(); setStep('ask'); }} />
      </View>
    );
  }

  if (direction === 'build') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>
          {isBinaryDaily ? 'Did you do this today?' : 'Count this toward your target?'}
        </Text>
        <PrimaryButtonV2
          accessibilityHint="Records this as complete"
          disabled={preview.buildCompletions >= target}
          label={isBinaryDaily ? 'Yes' : 'Yes, count it'}
          onPress={countBuild}
          reducedMotion={reducedMotion}
        />
        <SecondaryButtonV2 accessibilityHint="Closes without recording anything" label={isBinaryDaily ? 'Not today' : 'Not yet'} onPress={skipBuild} />
      </View>
    );
  }

  if (direction === 'cut') {
    return (
      <View style={styles.content}>
        <Text style={styles.behavior}>{behavior}</Text>
        <Text accessibilityRole="header" style={styles.headline}>How many {unit} {periodPhrase(periodUnit)}?</Text>
        <Text style={styles.supporting}>Maximum {formatValue(target, unit)}.</Text>
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel={`Current total in ${unit}`}
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={setCutInput}
            placeholder="0"
            placeholderTextColor={theme.colors.warmGrey}
            style={styles.input}
            value={cutInput}
          />
          <Text style={styles.inputUnit}>{unit}</Text>
        </View>
        <PrimaryButtonV2 accessibilityHint="Records this total" disabled={!validCutInput} label="Record" onPress={recordCut} reducedMotion={reducedMotion} />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <Text style={styles.behavior}>{behavior}</Text>
      <Text accessibilityRole="header" style={styles.headline}>Are you still keeping it?</Text>
      <PrimaryButtonV2 accessibilityHint="Records the promise as intact" label="Still keeping it" onPress={() => recordStop('intact')} reducedMotion={reducedMotion} />
      <SecondaryButtonV2 accessibilityHint="Reports a lapse" label="I slipped" onPress={() => { void playSelectionHaptic(); setStep('confirm_lapse'); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.small, paddingBottom: theme.spacing.small },
  behavior: { color: theme.colors.crimsonBright, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  headline: { color: theme.colors.ivory, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  supporting: { color: theme.colors.ivoryMuted, fontSize: 14, lineHeight: 20 },
  progressLine: { color: theme.colors.ivoryMuted, fontSize: 15, fontWeight: '600' },
  inputRow: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.structureLineStrong, borderRadius: theme.radius.controlled,
    backgroundColor: theme.colors.surface, paddingHorizontal: 16,
  },
  input: { flex: 1, color: theme.colors.ivory, fontSize: 22, paddingVertical: 10 },
  inputUnit: { color: theme.colors.crimsonBright, fontSize: 14, fontWeight: '700' },
});
