import type { ChallengeRule, SuccessRuleSnapshot, Weekday } from './types';

export type SuccessRuleSource = {
  readonly direction: 'build' | 'cut' | 'stop' | null;
  readonly measurement: 'completion' | 'count' | 'time' | 'amount' | 'abstinence' | null;
  readonly durationWeeks: number | null;
  readonly rhythm: {
    readonly type: 'daily' | 'weekly_count' | 'specific_days' | 'maximum_per_period' | 'continuous' | null;
    readonly period: 'day' | 'week' | null;
    readonly targetValue: string;
    readonly selectedWeekdays: readonly Weekday[];
    readonly timeUnit: 'minutes' | 'hours' | null;
    readonly amountUnit: string;
  };
};

export type StructuredRuleResult = { readonly challengeRule: ChallengeRule; readonly successRule: SuccessRuleSnapshot };

export function deriveSuccessRuleForChallengeRule(
  challengeRule: ChallengeRule,
  durationWeeks: number,
): SuccessRuleSnapshot | null {
  if (!Number.isInteger(durationWeeks) || durationWeeks < 2 || durationWeeks > 12) return null;

  switch (challengeRule.direction) {
    case 'build': {
      const rhythm = challengeRule.rhythm;
      if (rhythm.target <= 0 || !Number.isInteger(rhythm.target)) return null;
      if (rhythm.type === 'specific_days' &&
        (rhythm.weekdays.length !== rhythm.target || new Set(rhythm.weekdays).size !== rhythm.weekdays.length)) return null;
      const total = rhythm.periodUnit === 'day' ? durationWeeks * 7 : rhythm.target * durationWeeks;
      const allowed = rhythm.periodUnit === 'day'
        ? Math.max(1, Math.round(total * 0.1))
        : total < 4 ? 0 : Math.max(1, Math.floor(total * 0.15));
      return {
        direction: 'build', ruleVersion: 1, totalPlannedCompletions: total,
        minimumRequiredCompletions: total - allowed,
        continuitySafeguard: rhythm.periodUnit === 'day'
          ? { type: 'maximum_consecutive_missed_days', maximum: 2 }
          : rhythm.target >= 2
            ? { type: 'minimum_completions_per_week', minimum: rhythm.target - 1 }
            : { type: 'maximum_consecutive_missed_weeks', maximum: 1 },
        periodTarget: rhythm.target, periodUnit: rhythm.periodUnit,
      };
    }
    case 'cut_back': {
      if (!Number.isFinite(challengeRule.boundary.maximumValue) || challengeRule.boundary.maximumValue <= 0 ||
        !challengeRule.measurement.unit.trim() ||
        (challengeRule.measurement.type === 'count' && !Number.isInteger(challengeRule.boundary.maximumValue))) return null;
      const total = challengeRule.boundary.periodUnit === 'day' ? durationWeeks * 7 : durationWeeks;
      const allowed = challengeRule.boundary.periodUnit === 'day'
        ? Math.max(1, Math.round(total * 0.1))
        : total < 4 ? 0 : Math.max(1, Math.floor(total * 0.15));
      return {
        direction: 'cut_back', ruleVersion: 1, measurementType: challengeRule.measurement.type,
        maximumAllowedValue: challengeRule.boundary.maximumValue,
        periodUnit: challengeRule.boundary.periodUnit, totalPeriods: total,
        minimumPeriodsWithinLimit: total - allowed,
        continuitySafeguard: challengeRule.boundary.periodUnit === 'day'
          ? { type: 'maximum_consecutive_exceeded_days', maximum: 2 }
          : { type: 'maximum_consecutive_exceeded_weeks', maximum: 1 },
      };
    }
    case 'stop':
      return challengeRule.boundary.maximumLapses === 0
        ? { direction: 'stop', ruleVersion: 1, lapseRule: { type: 'zero_lapses' } }
        : null;
  }
}

export function deriveStructuredSuccessRule(source: SuccessRuleSource): StructuredRuleResult | null {
  const weeks = source.durationWeeks;
  if (!weeks || !Number.isInteger(weeks) || weeks < 2 || weeks > 12) return null;

  if (source.direction === 'build' && source.measurement === 'completion') {
    if (source.rhythm.type === 'daily') {
      const challengeRule = { direction: 'build', measurement: { type: 'completion', unit: 'completion' }, rhythm: { type: 'daily', periodUnit: 'day', target: 1 } } as const;
      const successRule = deriveSuccessRuleForChallengeRule(challengeRule, weeks);
      return successRule ? { challengeRule, successRule } : null;
    }
    const target = source.rhythm.type === 'weekly_count' ? positiveNumber(source.rhythm.targetValue) : source.rhythm.type === 'specific_days' ? source.rhythm.selectedWeekdays.length : null;
    if (!target || !Number.isInteger(target)) return null;
    const rhythm: Extract<ChallengeRule, { direction: 'build' }>['rhythm'] = source.rhythm.type === 'specific_days'
      ? { type: 'specific_days', periodUnit: 'week', target, weekdays: [...source.rhythm.selectedWeekdays] }
      : { type: 'weekly_count', periodUnit: 'week', target };
    const challengeRule: Extract<ChallengeRule, { direction: 'build' }> = { direction: 'build', measurement: { type: 'completion', unit: 'completion' }, rhythm };
    const successRule = deriveSuccessRuleForChallengeRule(challengeRule, weeks);
    return successRule ? { challengeRule, successRule } : null;
  }

  if (source.direction === 'cut' && (source.measurement === 'count' || source.measurement === 'time' || source.measurement === 'amount') && source.rhythm.type === 'maximum_per_period' && source.rhythm.period) {
    const maximum = positiveNumber(source.rhythm.targetValue);
    const unit = source.measurement === 'count' ? 'times' : source.measurement === 'time' ? source.rhythm.timeUnit : source.rhythm.amountUnit.trim();
    if (!maximum || !unit || (source.measurement === 'count' && !Number.isInteger(maximum))) return null;
    const challengeRule: Extract<ChallengeRule, { direction: 'cut_back' }> = { direction: 'cut_back', measurement: source.measurement === 'count' ? { type: 'count', unit } : source.measurement === 'time' ? { type: 'time', unit: source.rhythm.timeUnit! } : { type: 'amount', unit }, boundary: { periodUnit: source.rhythm.period, maximumValue: maximum } };
    const successRule = deriveSuccessRuleForChallengeRule(challengeRule, weeks);
    return successRule ? { challengeRule, successRule } : null;
  }

  if (source.direction === 'stop' && source.measurement === 'abstinence' && source.rhythm.type === 'continuous') {
    const challengeRule = { direction: 'stop', measurement: { type: 'abstinence', unit: 'lapse' }, boundary: { periodUnit: 'challenge', maximumLapses: 0 } } as const;
    const successRule = deriveSuccessRuleForChallengeRule(challengeRule, weeks);
    return successRule ? { challengeRule, successRule } : null;
  }
  return null;
}

const positiveNumber = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
