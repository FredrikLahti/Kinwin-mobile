import type { OnboardingDraftData } from './from-onboarding-draft';
import type { SuccessRuleSource } from './success-rule';
import type { ChallengeDraft } from './types';

/**
 * The reverse of mapOnboardingDraft: turns a normalized, already-validated
 * ChallengeDraft back into the shape the UI's onboarding context setters
 * expect. Only ever reads structured fields (rule/successRule/duration/…),
 * never parses `behavior.description` or any other display sentence to
 * reconstruct business rules.
 */
export function restoreOnboardingDraftData(draft: ChallengeDraft): OnboardingDraftData {
  return {
    goal: draft.goal,
    behaviorText: draft.behavior.description,
    definitionText: draft.behavior.completionDefinition,
    behaviorDirection: toSourceDirection(draft.behavior.rule.direction),
    measurementMode: draft.behavior.rule.measurement.type,
    rhythm: toSourceRhythm(draft.behavior.rule),
    durationWeeks: draft.duration.value,
    // Always the actual persisted minimum — whether that equals the V1
    // baseline (ruleVersion 1) or is a stricter V2 selection — never an
    // invented weaker value. See from-onboarding-draft.ts's field doc.
    successThresholdOverride: draft.successRule.direction === 'build'
      ? draft.successRule.minimumRequiredCompletions
      : draft.successRule.direction === 'cut_back'
        ? draft.successRule.minimumPeriodsWithinLimit
        : null,
    recipients: draft.recipients.map((recipient) => ({ id: recipient.id, name: recipient.name })),
    rewardOrganizer: draft.rewardOrganizer,
    experienceCategory: draft.experienceCategory,
    stakeAmount: draft.stake.minorUnits / 100,
    currency: draft.stake.currency,
    sitOutAcknowledged: draft.sitOutAcknowledged,
    invitationMessage: draft.invitationMessage,
    membershipChoice: draft.membershipSelection,
  };
}

function toSourceDirection(direction: ChallengeDraft['behavior']['rule']['direction']): SuccessRuleSource['direction'] {
  return direction === 'cut_back' ? 'cut' : direction;
}

function toSourceRhythm(rule: ChallengeDraft['behavior']['rule']): SuccessRuleSource['rhythm'] {
  const empty: SuccessRuleSource['rhythm'] = {
    type: null, period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '',
  };
  switch (rule.direction) {
    case 'build':
      switch (rule.rhythm.type) {
        case 'daily':
          return { ...empty, type: 'daily', period: 'day' };
        case 'weekly_count':
          return { ...empty, type: 'weekly_count', period: 'week', targetValue: String(rule.rhythm.target) };
        case 'specific_days':
          return {
            ...empty,
            type: 'specific_days',
            period: 'week',
            targetValue: String(rule.rhythm.target),
            selectedWeekdays: [...rule.rhythm.weekdays],
          };
      }
      break;
    case 'cut_back':
      return {
        ...empty,
        type: 'maximum_per_period',
        period: rule.boundary.periodUnit,
        targetValue: String(rule.boundary.maximumValue),
        timeUnit: rule.measurement.type === 'time' ? rule.measurement.unit : null,
        amountUnit: rule.measurement.type === 'amount' ? rule.measurement.unit : '',
      };
    case 'stop':
      return { ...empty, type: 'continuous' };
  }
  return empty;
}
