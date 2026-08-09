import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeChallengeIdentity,
  describeConsequence,
  describeDurationPosition,
  describeProgress,
  describeUpcomingStart,
  formatRecipientsCompact,
} from './challenge-summary';
import { ChallengePeriod } from '../../domain/challenge/periods';
import { CurrentPeriodStatus } from '../challenge-ux-preview/view-model';
import {
  ActivatedChallengeSnapshot,
  ChallengeId,
  ChallengePeriodId,
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

test('describeUpcomingStart: today/tomorrow/weekday/date thresholds in UTC', () => {
  const now = '2026-03-01T12:00:00Z';
  assert.equal(describeUpcomingStart('2026-03-01T00:00:00Z', now, 'UTC'), 'Starts today');
  assert.equal(describeUpcomingStart('2026-03-02T00:00:00Z', now, 'UTC'), 'Starts tomorrow');
  assert.equal(describeUpcomingStart('2026-03-04T00:00:00Z', now, 'UTC'), 'Starts Wednesday');
});

test('describeUpcomingStart: compares calendar days in the CHALLENGE timezone, not raw UTC days', () => {
  // Real production scenario that produced a wrong "Starts today": a
  // period starting at the next local midnight in Europe/Stockholm during
  // DST (UTC+2) lands at 22:00 UTC the *same* UTC calendar day as an
  // activation a few hours earlier — same-UTC-day comparison wrongly says
  // "today"; the period is actually tomorrow in the challenge's own zone.
  const activatedNow = '2026-08-09T18:42:53Z';
  const nextLocalMidnight = '2026-08-09T22:00:00Z';
  assert.equal(describeUpcomingStart(nextLocalMidnight, activatedNow, 'Europe/Stockholm'), 'Starts tomorrow');
  // The same instants read as the same UTC calendar day, so the UTC-zone
  // comparison legitimately still says "today".
  assert.equal(describeUpcomingStart(nextLocalMidnight, activatedNow, 'UTC'), 'Starts today');
});

function period(overrides: Partial<ChallengePeriod> = {}): ChallengePeriod {
  return {
    schemaVersion: 1,
    id: 'period-1' as ChallengePeriodId,
    challengeId: 'challenge-1' as ChallengeId,
    periodNumber: 2,
    periodKind: 'week',
    startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    endsAt: '2026-03-08T00:00:00Z' as IsoDateTime,
    reportingClosesAt: '2026-03-09T00:00:00Z' as IsoDateTime,
    target: { type: 'completion_target', target: 3 },
    ...overrides,
  };
}

test('describeProgress: Build weekly count with a reported fact — "2 of 3 this week"', () => {
  const challenge = baseChallenge({
    direction: 'build', measurement: { type: 'completion', unit: 'completion' }, rhythm: { type: 'weekly_count', periodUnit: 'week', target: 3 },
  });
  const status: CurrentPeriodStatus = { kind: 'reported', fact: { kind: 'build_completion', completions: 2 } };
  const result = describeProgress(challenge, status, { periodsClosed: 0, periodsMet: 0 }, period());
  assert.equal(result, '2 of 3 this week');
});

test('describeProgress: Build binary daily with closed periods — "Kept it 2 of 3 days"', () => {
  const challenge = baseChallenge({
    direction: 'build', measurement: { type: 'completion', unit: 'completion' }, rhythm: { type: 'daily', periodUnit: 'day', target: 1 },
  });
  const status: CurrentPeriodStatus = { kind: 'calm' };
  const focusPeriod = period({ periodKind: 'day', target: { type: 'completion_target', target: 1 } });
  const result = describeProgress(challenge, status, { periodsClosed: 3, periodsMet: 2 }, focusPeriod);
  assert.equal(result, 'Kept it 2 of 3 days');
});

test('describeProgress: Build with nothing closed and nothing reported yet returns null (hide the section)', () => {
  const challenge = baseChallenge({
    direction: 'build', measurement: { type: 'completion', unit: 'completion' }, rhythm: { type: 'weekly_count', periodUnit: 'week', target: 3 },
  });
  const status: CurrentPeriodStatus = { kind: 'calm' };
  const result = describeProgress(challenge, status, { periodsClosed: 0, periodsMet: 0 }, period());
  assert.equal(result, null);
});

test('describeProgress: Limit with a reported total — "45 of 120 minutes today"', () => {
  const challenge = baseChallenge({
    direction: 'cut_back', measurement: { type: 'time', unit: 'minutes' }, boundary: { periodUnit: 'day', maximumValue: 120 },
  });
  const status: CurrentPeriodStatus = { kind: 'reported', fact: { kind: 'cut_back_total', total: 45, unit: 'minutes' } };
  const focusPeriod = period({ periodKind: 'day', target: { type: 'maximum_value', maximum: 120, measurement: { type: 'time', unit: 'minutes' } } });
  const result = describeProgress(challenge, status, { periodsClosed: 0, periodsMet: 0 }, focusPeriod);
  assert.equal(result, '45 of 120 minutes today');
});

test('describeProgress: Limit with nothing reported yet falls back to the plain rule — "Stay under 120 minutes per day"', () => {
  const challenge = baseChallenge({
    direction: 'cut_back', measurement: { type: 'time', unit: 'minutes' }, boundary: { periodUnit: 'day', maximumValue: 120 },
  });
  const status: CurrentPeriodStatus = { kind: 'calm' };
  const result = describeProgress(challenge, status, { periodsClosed: 0, periodsMet: 0 }, period());
  assert.equal(result, 'Stay under 120 minutes per day');
});

test('describeProgress: Avoid never shows a progress line', () => {
  const challenge = baseChallenge({
    direction: 'stop', measurement: { type: 'abstinence', unit: 'lapse' }, boundary: { periodUnit: 'challenge', maximumLapses: 0 },
  });
  const status: CurrentPeriodStatus = { kind: 'calm' };
  const result = describeProgress(challenge, status, { periodsClosed: 0, periodsMet: 0 }, null);
  assert.equal(result, null);
});

test('describeDurationPosition: week/day periods show a position, continuous and missing periods do not', () => {
  assert.equal(describeDurationPosition(period({ periodKind: 'week', periodNumber: 2 }), 4), 'Week 2 of 4');
  assert.equal(describeDurationPosition(period({ periodKind: 'day', periodNumber: 12 }), 28), 'Day 12 of 28');
  assert.equal(describeDurationPosition(period({ periodKind: 'continuous', periodNumber: 1, target: { type: 'maximum_lapses', maximum: 0 } }), 1), null);
  assert.equal(describeDurationPosition(null, 4), null);
});
