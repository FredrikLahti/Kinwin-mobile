import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CreateFlowScreenV2 } from '@/components/v2/create-flow-screen';
import { PrimaryButtonV2 } from '@/components/v2/primary-button';
import { kinwinThemeV2 as theme } from '@/constants/theme-v2';
import { useOnboarding } from '@/contexts/onboarding-context';
import { clampSuccessThreshold, deriveStructuredSuccessRule, successThresholdBounds } from '@/domain/challenge/success-rule';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getStepInfo } from '@/lib/challenge-creation/steps';
import { playSelectionHaptic } from '@/lib/haptics';
import { calculateSuccessRule } from '@/lib/success-rule';

/**
 * Success Means: the founder-mandated step between Duration and
 * Recipients (all three directions) where Kinwin shows its computed
 * baseline requirement and lets the user make it stricter — never
 * easier. See docs/PRODUCT_DECISIONS.md for the locked rule this screen
 * enforces on the client side; domain/challenge/success-rule.ts's
 * applySuccessThreshold and the SQL trusted boundary enforce it for real.
 *
 * Build/Limit show an integer stepper bounded to
 * [Kinwin's baseline, total planned]. Avoid has no control at all — zero
 * lapses is the whole point, so this screen shows that fixed statement
 * only, deliberately with no stepper and no "one allowed lapse" framing.
 */
export default function CreateSuccessMeansScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const onboarding = useOnboarding();
  const {
    behaviorDirection, behaviorText, definitionText, durationWeeks, goal,
    measurementMode, rhythm, setSuccessThresholdOverride, successThresholdOverride,
  } = onboarding;
  const { currentStep, totalSteps } = getStepInfo(behaviorDirection, 'success_means');
  const isStop = behaviorDirection === 'stop';

  const baseline = deriveStructuredSuccessRule({ direction: behaviorDirection, measurement: measurementMode, durationWeeks, rhythm });
  const bounds = baseline ? successThresholdBounds(baseline.successRule) : null;
  const selected = bounds ? clampSuccessThreshold(successThresholdOverride, bounds) : null;

  // Keeps stored state in sync with the live-derived valid range whenever
  // an upstream input (duration, Build frequency, selected weekdays,
  // Limit period) changes — the founder's recalculation policy: preserve
  // a stricter intent if it still fits the new range, otherwise clamp,
  // NEVER below the new baseline and NEVER above the new total. A no-op
  // for Avoid, which has no bounds and no adjustable state.
  useEffect(() => {
    if (selected !== null && selected !== successThresholdOverride) {
      setSuccessThresholdOverride(selected);
    }
  }, [selected, successThresholdOverride, setSuccessThresholdOverride]);

  const preview = calculateSuccessRule(
    { behaviorDirection, behaviorText, definitionText, durationWeeks, goal, measurementMode, rhythm },
    bounds ? selected : null,
  );
  const canContinue = Boolean(baseline && preview);
  const atBaseline = bounds !== null && selected === bounds.minimum;

  const adjust = (change: number) => {
    if (!bounds || selected === null) return;
    const next = Math.max(bounds.minimum, Math.min(bounds.total, selected + change));
    if (next === selected) return;
    void playSelectionHaptic();
    setSuccessThresholdOverride(next);
  };

  const continueToRecipients = () => {
    if (!canContinue) return;
    router.push('/create/recipients');
  };

  return (
    <CreateFlowScreenV2
      backHint="Returns to duration"
      currentStep={currentStep}
      footer={
        <PrimaryButtonV2
          accessibilityHint={canContinue ? 'Continues to loved ones' : 'Complete the earlier steps before continuing'}
          disabled={!canContinue}
          label="Continue"
          onPress={continueToRecipients}
          reducedMotion={reducedMotion}
        />
      }
      headline="What counts as success?"
      onBack={() => router.back()}
      progressLabel={`Step ${currentStep} of ${totalSteps}: success means`}
      supportingCopy={isStop
        ? 'Complete abstinence is strict by design. No allowance, for the full challenge.'
        : 'Kinwin sets the minimum. You can make your challenge stricter, but not easier.'}
      totalSteps={totalSteps}
    >
      {!isStop && bounds && selected !== null && (
        <>
          <View style={styles.stepper}>
            <Pressable
              accessibilityLabel="Decrease requirement"
              accessibilityRole="button"
              accessibilityState={{ disabled: selected <= bounds.minimum }}
              disabled={selected <= bounds.minimum}
              onPress={() => adjust(-1)}
              style={[styles.stepperAction, selected <= bounds.minimum && styles.disabledControl]}
            >
              <Text aria-hidden style={styles.stepperSymbol}>−</Text>
            </Pressable>
            <View style={styles.stepperValue}>
              <Text style={styles.stepperNumber}>{selected}</Text>
              <Text style={styles.stepperUnit}>OF {bounds.total}</Text>
            </View>
            <Pressable
              accessibilityLabel="Increase requirement"
              accessibilityRole="button"
              accessibilityState={{ disabled: selected >= bounds.total }}
              disabled={selected >= bounds.total}
              onPress={() => adjust(1)}
              style={[styles.stepperAction, selected >= bounds.total && styles.disabledControl]}
            >
              <Text aria-hidden style={styles.stepperSymbol}>＋</Text>
            </Pressable>
          </View>
          <Text style={styles.baselineNote}>
            {atBaseline ? 'This is Kinwin’s minimum for your plan.' : 'Stricter than Kinwin’s minimum for your plan.'}
          </Text>
        </>
      )}

      {preview && (
        <View style={[styles.summary, isStop && styles.summaryAllOrNothing]}>
          <Text style={styles.summaryLabel}>{isStop ? 'ALL OR NOTHING' : 'SUCCESS MEANS'}</Text>
          <Text style={styles.summaryText}>{preview.overall}</Text>
          {preview.continuity && <Text style={styles.continuityText}>{preview.continuity}</Text>}
        </View>
      )}
    </CreateFlowScreenV2>
  );
}

const styles = StyleSheet.create({
  stepper: {
    minHeight: 76, flexDirection: 'row', borderRadius: theme.radius.controlled, borderWidth: 1,
    borderColor: theme.colors.structureLine, backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  stepperAction: { width: 64, alignItems: 'center', justifyContent: 'center' },
  stepperSymbol: { color: theme.colors.ivory, fontSize: 24, fontWeight: '300' },
  stepperValue: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.colors.structureLine,
  },
  stepperNumber: { color: theme.colors.ivory, fontSize: 30, fontWeight: '700' },
  stepperUnit: { marginTop: 2, color: theme.colors.warmGrey, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  disabledControl: { opacity: 0.35 },
  baselineNote: { marginTop: 10, color: theme.colors.warmGrey, fontSize: 12, textAlign: 'center' },
  summary: {
    marginTop: 20, borderLeftWidth: 2, borderLeftColor: theme.colors.oxblood, backgroundColor: theme.colors.surface,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: theme.radius.precise,
  },
  summaryAllOrNothing: { borderLeftColor: theme.colors.ivory },
  summaryLabel: { color: theme.colors.ivoryMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  summaryText: { marginTop: 5, color: theme.colors.ivory, fontSize: 15, lineHeight: 21 },
  continuityText: { marginTop: 6, color: theme.colors.warmGrey, fontSize: 13, lineHeight: 18 },
});
