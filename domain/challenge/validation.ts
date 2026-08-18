import { ChallengeDraft, CurrencyCode } from './types';
import { deriveSuccessRuleForChallengeRule } from './success-rule';

export type ActivationIssue = { readonly field: string; readonly code: string; readonly message: string };

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ['USD' as CurrencyCode];

const issue = (field: string, code: string, message: string): ActivationIssue => ({ field, code, message });

export function validateActivationReadiness(draft: ChallengeDraft): ActivationIssue[] {
  const issues: ActivationIssue[] = [];
  if (draft.goal.trim().length < 3) issues.push(issue('goal', 'incomplete', 'A larger goal is required.'));
  if (draft.behavior.description.trim().length < 3) issues.push(issue('behavior.description', 'incomplete', 'A primary behavior is required.'));
  if (draft.behavior.completionDefinition.trim().length < 3) issues.push(issue('behavior.completionDefinition', 'incomplete', 'A completion definition is required.'));
  if (draft.duration.unit !== 'week' || !Number.isInteger(draft.duration.value) || draft.duration.value < 2 || draft.duration.value > 12) {
    issues.push(issue('duration', 'out_of_range', 'Duration must be between 2 and 12 whole weeks.'));
  }
  validateRule(draft, issues);
  const validRecipients = draft.recipients.filter((recipient) => recipient.name.trim().length > 0 && recipient.name.trim().length <= 50);
  const recipientIds = new Set(draft.recipients.map(({ id }) => id));
  if (validRecipients.length !== draft.recipients.length || draft.recipients.length < 1 || draft.recipients.length > 4) {
    issues.push(issue('recipients', 'invalid', 'Between one and four recipients with valid names are required.'));
  }
  if (recipientIds.size !== draft.recipients.length) issues.push(issue('recipients', 'duplicate', 'Recipient identities must be unique.'));
  if (!draft.rewardOrganizer) {
    issues.push(issue('rewardOrganizer', 'missing', 'A reward organizer is required.'));
  } else {
    const organizer = draft.rewardOrganizer;
    if (organizer.type === 'recipient' && !validRecipients.some(({ id }) => id === organizer.recipientId)) {
      issues.push(issue('rewardOrganizer.recipientId', 'inconsistent', 'The organizer must reference a challenge recipient.'));
    } else if (organizer.type === 'other' && (organizer.name.trim().length < 1 || organizer.name.trim().length > 50)) {
      issues.push(issue('rewardOrganizer.name', 'invalid', 'The organizer name is required.'));
    }
  }
  if (!draft.experienceCategory) issues.push(issue('experienceCategory', 'missing', 'An experience category is required.'));
  if (!Number.isSafeInteger(draft.stake.minorUnits) || draft.stake.minorUnits <= 0) issues.push(issue('stake.minorUnits', 'invalid', 'The stake must be a positive amount in minor units.'));
  if (!SUPPORTED_CURRENCIES.includes(draft.stake.currency)) issues.push(issue('stake.currency', 'unsupported', 'The selected currency is not supported.'));
  if (!draft.sitOutAcknowledged) issues.push(issue('sitOutAcknowledged', 'missing', 'The sit-out promise must be acknowledged.'));
  if (draft.invitationMessage.trim().length < 3) issues.push(issue('invitationMessage', 'invalid', 'A valid invitation message is required.'));
  if (!draft.membershipSelection) issues.push(issue('membershipSelection', 'missing', 'A membership selection is required.'));
  return issues;
}

function validateRule(draft: ChallengeDraft, issues: ActivationIssue[]) {
  const rule = draft.behavior.rule;
  const success = draft.successRule;
  const derived = deriveSuccessRuleForChallengeRule(rule, draft.duration.value);
  const consistent = derived && (success.ruleVersion === 1 ? successRulesEqual(success, derived) : successRuleWithinV2Bounds(success, derived));
  if (!derived || !consistent) {
    issues.push(issue('successRule', 'inconsistent', 'The success rule must exactly match the versioned challenge rule, or be a valid Success Means selection at or above Kinwin’s baseline.'));
    return;
  }
  if (rule.direction !== success.direction) {
    issues.push(issue('successRule.direction', 'inconsistent', 'The success rule must match the behavior direction.'));
    return;
  }
  switch (success.direction) {
    case 'build':
      if (rule.direction !== 'build') return;
      if (success.periodTarget <= 0 || success.minimumRequiredCompletions <= 0 || success.totalPlannedCompletions < success.minimumRequiredCompletions ||
        success.periodTarget !== rule.rhythm.target || success.periodUnit !== rule.rhythm.periodUnit) {
        issues.push(issue('successRule', 'invalid', 'Build targets and safeguards must be valid.'));
      }
      break;
    case 'cut_back':
      if (rule.direction !== 'cut_back') return;
      if (success.maximumAllowedValue <= 0 || success.minimumPeriodsWithinLimit <= 0 || success.minimumPeriodsWithinLimit > success.totalPeriods || success.measurementType !== rule.measurement.type ||
        success.maximumAllowedValue !== rule.boundary.maximumValue || success.periodUnit !== rule.boundary.periodUnit) {
        issues.push(issue('successRule', 'invalid', 'Cut back boundary and adherence must be valid.'));
      }
      break;
    case 'stop':
      if (rule.direction !== 'stop') return;
      if (success.lapseRule.type !== 'zero_lapses' || rule.boundary.maximumLapses !== 0) issues.push(issue('successRule.lapseRule', 'unsupported', 'V1 Stop challenges require zero lapses.'));
      break;
  }
}

function successRulesEqual(left: ChallengeDraft['successRule'], right: ChallengeDraft['successRule']) {
  if (left.direction !== right.direction || left.ruleVersion !== right.ruleVersion) return false;
  switch (left.direction) {
    case 'build':
      if (right.direction !== 'build') return false;
      return left.totalPlannedCompletions === right.totalPlannedCompletions &&
        left.minimumRequiredCompletions === right.minimumRequiredCompletions &&
        left.periodTarget === right.periodTarget && left.periodUnit === right.periodUnit &&
        safeguardsEqual(left.continuitySafeguard, right.continuitySafeguard);
    case 'cut_back':
      if (right.direction !== 'cut_back') return false;
      return left.measurementType === right.measurementType && left.maximumAllowedValue === right.maximumAllowedValue &&
        left.periodUnit === right.periodUnit && left.totalPeriods === right.totalPeriods &&
        left.minimumPeriodsWithinLimit === right.minimumPeriodsWithinLimit &&
        safeguardsEqual(left.continuitySafeguard, right.continuitySafeguard);
    case 'stop':
      return right.direction === 'stop' && left.lapseRule.type === right.lapseRule.type;
  }
}

/**
 * ruleVersion 2's counterpart to successRulesEqual: every field must match
 * the derived V1 baseline exactly EXCEPT the overall minimum, which the
 * user may only have made stricter — never below the baseline, never
 * above the total. Stop/Avoid has no V2 (see types.ts); returning false
 * for it here rejects any V2 stop successRule as inconsistent.
 */
function successRuleWithinV2Bounds(left: ChallengeDraft['successRule'], baseline: ChallengeDraft['successRule']) {
  if (left.direction !== baseline.direction) return false;
  switch (left.direction) {
    case 'build':
      if (baseline.direction !== 'build') return false;
      return left.totalPlannedCompletions === baseline.totalPlannedCompletions &&
        left.periodTarget === baseline.periodTarget && left.periodUnit === baseline.periodUnit &&
        safeguardsEqual(left.continuitySafeguard, baseline.continuitySafeguard) &&
        left.minimumRequiredCompletions >= baseline.minimumRequiredCompletions &&
        left.minimumRequiredCompletions <= left.totalPlannedCompletions;
    case 'cut_back':
      if (baseline.direction !== 'cut_back') return false;
      return left.measurementType === baseline.measurementType && left.maximumAllowedValue === baseline.maximumAllowedValue &&
        left.periodUnit === baseline.periodUnit && left.totalPeriods === baseline.totalPeriods &&
        safeguardsEqual(left.continuitySafeguard, baseline.continuitySafeguard) &&
        left.minimumPeriodsWithinLimit >= baseline.minimumPeriodsWithinLimit &&
        left.minimumPeriodsWithinLimit <= left.totalPeriods;
    case 'stop':
      return false;
  }
}

function safeguardsEqual(
  left: Extract<ChallengeDraft['successRule'], { direction: 'build' | 'cut_back' }>['continuitySafeguard'],
  right: Extract<ChallengeDraft['successRule'], { direction: 'build' | 'cut_back' }>['continuitySafeguard'],
) {
  if (left.type !== right.type) return false;
  const leftValue = 'minimum' in left ? left.minimum : left.maximum;
  const rightValue = 'minimum' in right ? right.minimum : right.maximum;
  return leftValue === rightValue;
}
