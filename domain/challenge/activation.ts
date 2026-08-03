import { ActivatedChallengeSnapshot, ChallengeDraft, ChallengeId, ConsequenceId, IsoDateTime, TimeZoneId } from './types';
import { ActivationIssue, validateActivationReadiness } from './validation';

export type ActivationMetadata = {
  readonly challengeId: ChallengeId;
  readonly consequenceId: ConsequenceId;
  readonly activatedAt: IsoDateTime;
  readonly timezone: TimeZoneId;
  readonly startsAt: IsoDateTime;
  readonly plannedEndsAt: IsoDateTime;
  readonly membershipStatus: ActivatedChallengeSnapshot['membershipStatusAtActivation'];
};

export type ActivationBuildResult = { readonly ok: true; readonly value: ActivatedChallengeSnapshot } | { readonly ok: false; readonly issues: readonly ActivationIssue[] };

export function buildActivatedChallengeSnapshot(draft: ChallengeDraft, metadata: ActivationMetadata): ActivationBuildResult {
  const issues = validateActivationReadiness(draft);
  if (issues.length > 0) return { ok: false, issues };

  // Validation guarantees these values; copying prevents later draft-array mutations from changing the snapshot.
  const snapshot: ActivatedChallengeSnapshot = {
    schemaVersion: 1,
    id: metadata.challengeId,
    draftId: draft.id,
    consequenceId: metadata.consequenceId,
    ownerId: draft.ownerId,
    activatedAt: metadata.activatedAt,
    timezone: metadata.timezone,
    startsAt: metadata.startsAt,
    plannedEndsAt: metadata.plannedEndsAt,
    goal: draft.goal.trim(),
    behavior: { description: draft.behavior.description.trim(), completionDefinition: draft.behavior.completionDefinition.trim(), rule: copyRule(draft.behavior.rule) },
    duration: { ...draft.duration },
    successRule: copySuccessRule(draft.successRule),
    recipients: draft.recipients.map((recipient) => ({ ...recipient, name: recipient.name.trim() })),
    rewardOrganizer: { ...draft.rewardOrganizer! },
    consequenceCategory: draft.experienceCategory!,
    stake: { ...draft.stake },
    sitOutAcknowledged: true,
    membershipStatusAtActivation: metadata.membershipStatus,
    status: 'active',
    ruleEngineVersion: 1,
  };
  return { ok: true, value: snapshot };
}

const copyRule = (rule: ChallengeDraft['behavior']['rule']): ChallengeDraft['behavior']['rule'] => {
  switch (rule.direction) {
    case 'build': return { ...rule, measurement: { ...rule.measurement }, rhythm: rule.rhythm.type === 'specific_days' ? { ...rule.rhythm, weekdays: [...rule.rhythm.weekdays] } : { ...rule.rhythm } };
    case 'cut_back': return { ...rule, measurement: { ...rule.measurement }, boundary: { ...rule.boundary } };
    case 'stop': return { ...rule, measurement: { ...rule.measurement }, boundary: { ...rule.boundary } };
  }
};

const copySuccessRule = (rule: ChallengeDraft['successRule']): ChallengeDraft['successRule'] => {
  switch (rule.direction) {
    case 'build': return { ...rule, continuitySafeguard: { ...rule.continuitySafeguard } };
    case 'cut_back': return { ...rule, continuitySafeguard: { ...rule.continuitySafeguard } };
    case 'stop': return { ...rule, lapseRule: { ...rule.lapseRule } };
  }
};
