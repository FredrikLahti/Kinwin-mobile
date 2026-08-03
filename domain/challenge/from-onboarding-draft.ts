import { deriveStructuredSuccessRule } from './success-rule';
import type { SuccessRuleSource } from './success-rule';
import type { ChallengeDraft, ChallengeDraftId, CurrencyCode, RecipientId, UserId } from './types';

export type OnboardingDraftData = {
  readonly goal: string;
  readonly behaviorText: string;
  readonly definitionText: string;
  readonly behaviorDirection: SuccessRuleSource['direction'];
  readonly measurementMode: SuccessRuleSource['measurement'];
  readonly rhythm: SuccessRuleSource['rhythm'];
  readonly durationWeeks: number | null;
  readonly recipients: readonly { readonly id: string; readonly name: string }[];
  readonly rewardOrganizer: { readonly type: 'recipient'; readonly recipientId: string } | { readonly type: 'other'; readonly name: string } | null;
  readonly experienceCategory: ChallengeDraft['experienceCategory'];
  readonly stakeAmount: number | null;
  readonly currency: string;
  readonly sitOutAcknowledged: boolean;
  readonly invitationMessage: string;
  readonly membershipChoice: ChallengeDraft['membershipSelection'];
};

export type DraftMappingMetadata = {
  readonly draftId: ChallengeDraftId;
  readonly ownerId: UserId;
  /** Maps ephemeral UI recipient IDs to caller-supplied production IDs; names and indexes never become identities. */
  readonly recipientIds: Readonly<Record<string, RecipientId>>;
};

export type DraftMappingIssueCode =
  | 'missing_goal' | 'missing_behavior' | 'missing_definition' | 'unsupported_direction_measurement'
  | 'invalid_duration' | 'invalid_success_rule' | 'missing_recipient' | 'duplicate_recipient'
  | 'invalid_organizer' | 'invalid_stake' | 'unsupported_currency'
  | 'missing_experience_category'
  | 'missing_sit_out_acknowledgement' | 'invalid_invitation_message' | 'missing_membership_selection';
export type DraftMappingIssue = { readonly code: DraftMappingIssueCode; readonly field: string; readonly message: string };
export type DraftMappingResult = { readonly ok: true; readonly value: ChallengeDraft } | { readonly ok: false; readonly issues: readonly DraftMappingIssue[] };

export function mapOnboardingDraft(data: OnboardingDraftData, metadata: DraftMappingMetadata): DraftMappingResult {
  const issues: DraftMappingIssue[] = [];
  const add = (code: DraftMappingIssueCode, field: string, message: string) => issues.push({ code, field, message });
  if (data.goal.trim().length < 3) add('missing_goal', 'goal', 'A larger goal is required.');
  if (data.behaviorText.trim().length < 3) add('missing_behavior', 'behaviorText', 'A primary behavior is required.');
  if (data.definitionText.trim().length < 3) add('missing_definition', 'definitionText', 'A completion definition is required.');
  if (!data.durationWeeks || !Number.isInteger(data.durationWeeks) || data.durationWeeks < 2 || data.durationWeeks > 12) add('invalid_duration', 'durationWeeks', 'Duration must be 2–12 whole weeks.');

  const compatible = (data.behaviorDirection === 'build' && data.measurementMode === 'completion') ||
    (data.behaviorDirection === 'cut' && (data.measurementMode === 'count' || data.measurementMode === 'time' || data.measurementMode === 'amount')) ||
    (data.behaviorDirection === 'stop' && data.measurementMode === 'abstinence');
  if (!compatible) add('unsupported_direction_measurement', 'measurementMode', 'Direction and measurement are incompatible.');
  const structured = compatible ? deriveStructuredSuccessRule({ direction: data.behaviorDirection, measurement: data.measurementMode, durationWeeks: data.durationWeeks, rhythm: data.rhythm }) : null;
  if (compatible && !structured) add('invalid_success_rule', 'rhythm', 'The rhythm or boundary cannot produce an approved success rule.');

  if (data.recipients.length < 1 || data.recipients.length > 4) add('missing_recipient', 'recipients', 'Between one and four recipients are required.');
  const seenLocal = new Set<string>();
  const seenProduction = new Set<RecipientId>();
  const recipients = data.recipients.flatMap((recipient, index) => {
    const id = metadata.recipientIds[recipient.id];
    if (!recipient.name.trim() || recipient.name.trim().length > 50) add('missing_recipient', `recipients.${index}.name`, 'Recipient name must contain 1–50 characters.');
    if (!recipient.id || seenLocal.has(recipient.id) || (id && seenProduction.has(id))) add('duplicate_recipient', `recipients.${index}.id`, 'Recipient identities must be unique.');
    seenLocal.add(recipient.id);
    if (!id) {
      add('missing_recipient', `recipients.${index}.id`, 'A caller-supplied recipient ID is required.');
      return [];
    }
    seenProduction.add(id);
    return [{ id, name: recipient.name.trim(), invitationId: null }];
  });

  let organizer: ChallengeDraft['rewardOrganizer'] = null;
  if (data.rewardOrganizer?.type === 'recipient') {
    const recipientId = metadata.recipientIds[data.rewardOrganizer.recipientId];
    if (!recipientId || !recipients.some(({ id }) => id === recipientId)) add('invalid_organizer', 'rewardOrganizer.recipientId', 'The organizer must reference a mapped recipient.');
    else organizer = { type: 'recipient', recipientId };
  } else if (data.rewardOrganizer?.type === 'other' && data.rewardOrganizer.name.trim() && data.rewardOrganizer.name.trim().length <= 50) {
    organizer = { type: 'other', name: data.rewardOrganizer.name.trim() };
  } else add('invalid_organizer', 'rewardOrganizer', 'A valid recipient or external organizer is required.');

  const minorUnits = normalizeWholeDollarStake(data.stakeAmount);
  if (minorUnits === null) add('invalid_stake', 'stakeAmount', 'Stake must be a positive, safely representable whole-dollar amount.');
  if (data.currency !== 'USD') add('unsupported_currency', 'currency', 'Only USD is currently supported.');
  if (!data.experienceCategory) add('missing_experience_category', 'experienceCategory', 'An experience category is required.');
  if (!data.sitOutAcknowledged) add('missing_sit_out_acknowledgement', 'sitOutAcknowledged', 'The sit-out promise must be acknowledged.');
  if (data.invitationMessage.trim().length < 3) add('invalid_invitation_message', 'invitationMessage', 'A valid invitation message is required.');
  if (!data.membershipChoice) add('missing_membership_selection', 'membershipChoice', 'A membership selection is required.');
  if (issues.length || !structured || !organizer || minorUnits === null || !data.experienceCategory) return { ok: false, issues };

  return { ok: true, value: {
    schemaVersion: 1, id: metadata.draftId, ownerId: metadata.ownerId,
    goal: data.goal.trim(), behavior: { description: data.behaviorText.trim(), completionDefinition: data.definitionText.trim(), rule: structured.challengeRule },
    duration: { unit: 'week', value: data.durationWeeks! }, successRule: structured.successRule,
    recipients, rewardOrganizer: organizer, experienceCategory: data.experienceCategory,
    stake: { minorUnits, currency: data.currency as CurrencyCode }, sitOutAcknowledged: true,
    invitationMessage: data.invitationMessage.trim(), membershipSelection: data.membershipChoice,
  } };
}

export function normalizeWholeDollarStake(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  const minorUnits = value * 100;
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}
