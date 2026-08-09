import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeChallengeIdentity,
  describeConsequence,
  describeUpcomingStart,
  formatRecipientsCompact,
} from './challenge-summary';
import {
  ActivatedChallengeSnapshot,
  ChallengeId,
  ConsequenceId,
  IsoDateTime,
  RecipientId,
  SuccessRuleSnapshot,
  UserId,
} from '../../domain/challenge/types';

function baseChallenge(
  rule: ActivatedChallengeSnapshot['behavior']['rule'],
  overrides: Partial<ActivatedChallengeSnapshot> = {},
): ActivatedChallengeSnapshot {
  const successRule = { direction: rule.direction } as unknown as SuccessRuleSnapshot;
  return {
    schemaVersion: 1,
    id: 'challenge-1' as ChallengeId,
    draftId: 'draft-1' as ActivatedChallengeSnapshot['draftId'],
    consequenceId: 'consequence-1' as ConsequenceId,
    ownerId: 'owner-1' as UserId,
    activatedAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    timezone: 'UTC' as ActivatedChallengeSnapshot['timezone'],
    startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    plannedEndsAt: '2026-03-08T00:00:00Z' as IsoDateTime,
    goal: 'Get fitter',
    behavior: { description: 'Walk for at least 20 minutes', completionDefinition: 'Walk for at least 20 minutes, 3 times per week', rule },
    duration: { unit: 'week', value: 4 },
    successRule,
    recipients: [{ id: 'recipient-1' as RecipientId, name: 'Mom', invitationId: null }],
    rewardOrganizer: { type: 'other', name: 'Mom' },
    consequenceCategory: 'dinner',
    stake: { minorUnits: 5000, currency: 'USD' as ActivatedChallengeSnapshot['stake']['currency'] },
    sitOutAcknowledged: true,
    membershipStatusAtActivation: 'active',
    status: 'active',
    ruleEngineVersion: 1,
    ...overrides,
  };
}

test('describeChallengeIdentity: Build weekly count — Walk for at least 20 minutes / 3 times per week', () => {
  const challenge = baseChallenge({
    direction: 'build',
    measurement: { type: 'completion', unit: 'completion' },
    rhythm: { type: 'weekly_count', periodUnit: 'week', target: 3 },
  });
  const identity = describeChallengeIdentity(challenge);
  assert.equal(identity.headline, 'Walk for at least 20 minutes');
  assert.equal(identity.ruleDetail, '3 times per week');
});

test('describeChallengeIdentity: Build daily', () => {
  const challenge = baseChallenge({
    direction: 'build',
    measurement: { type: 'completion', unit: 'completion' },
    rhythm: { type: 'daily', periodUnit: 'day', target: 1 },
  });
  assert.equal(describeChallengeIdentity(challenge).ruleDetail, 'Every day');
});

test('describeChallengeIdentity: Build specific days joins weekday names', () => {
  const challenge = baseChallenge({
    direction: 'build',
    measurement: { type: 'completion', unit: 'completion' },
    rhythm: { type: 'specific_days', periodUnit: 'week', weekdays: ['monday', 'wednesday', 'friday'], target: 3 },
  });
  assert.equal(describeChallengeIdentity(challenge).ruleDetail, 'Monday, Wednesday and Friday');
});

test('describeChallengeIdentity: Limit — Social media / Up to 120 minutes per day', () => {
  const challenge = baseChallenge(
    { direction: 'cut_back', measurement: { type: 'time', unit: 'minutes' }, boundary: { periodUnit: 'day', maximumValue: 120 } },
    { behavior: { description: 'Social media', completionDefinition: 'Social media: up to 120 minutes per day', rule: {
      direction: 'cut_back', measurement: { type: 'time', unit: 'minutes' }, boundary: { periodUnit: 'day', maximumValue: 120 },
    } } },
  );
  const identity = describeChallengeIdentity(challenge);
  assert.equal(identity.headline, 'Social media');
  assert.equal(identity.ruleDetail, 'Up to 120 minutes per day');
});

test('describeChallengeIdentity: Avoid — No smoking, single line, no invented completion count', () => {
  const challenge = baseChallenge(
    { direction: 'stop', measurement: { type: 'abstinence', unit: 'lapse' }, boundary: { periodUnit: 'challenge', maximumLapses: 0 } },
    { behavior: { description: 'Smoking', completionDefinition: 'No smoking', rule: {
      direction: 'stop', measurement: { type: 'abstinence', unit: 'lapse' }, boundary: { periodUnit: 'challenge', maximumLapses: 0 },
    } } },
  );
  const identity = describeChallengeIdentity(challenge);
  assert.equal(identity.headline, 'No smoking');
  assert.equal(identity.ruleDetail, null);
});

test('formatRecipientsCompact: scales the same shape regardless of count', () => {
  assert.equal(formatRecipientsCompact([]), 'Your recipients');
  assert.equal(formatRecipientsCompact(['Mom']), 'Mom');
  assert.equal(formatRecipientsCompact(['Mom', 'Dad']), 'Mom, Dad');
  assert.equal(formatRecipientsCompact(['Mom', 'Dad', 'Elsa']), 'Mom, Dad +1');
  assert.equal(formatRecipientsCompact(['Mom', 'Dad', 'Elsa', 'Sam']), 'Mom, Dad +2');
});

test('describeConsequence: structured facts, never a prose sentence implying a direct payout', () => {
  const challenge = baseChallenge({
    direction: 'build', measurement: { type: 'completion', unit: 'completion' }, rhythm: { type: 'daily', periodUnit: 'day', target: 1 },
  });
  const consequence = describeConsequence(challenge);
  assert.equal(consequence.recipientsCompact, 'Mom');
  assert.equal(consequence.categoryLabel, 'Dinner');
  assert.equal(consequence.stakeLabel, '$50');
});

test('describeUpcomingStart: today/tomorrow/weekday/date thresholds', () => {
  const now = '2026-03-01T12:00:00Z';
  assert.equal(describeUpcomingStart('2026-03-01T00:00:00Z', now), 'Starts today');
  assert.equal(describeUpcomingStart('2026-03-02T00:00:00Z', now), 'Starts tomorrow');
  assert.equal(describeUpcomingStart('2026-03-04T00:00:00Z', now), 'Starts Wednesday');
});
