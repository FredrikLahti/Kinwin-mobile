import assert from 'node:assert/strict';
import test from 'node:test';

import { ChallengePeriod } from './periods';
import {
  ActivatedChallengeSnapshot,
  ChallengeId,
  ChallengePeriodId,
  ConsequenceId,
  CheckInId,
  IsoDateTime,
  RecipientId,
  SuccessRuleSnapshot,
  UserId,
} from './types';
import { computeCutBackAggregateOnly, evaluateChallenge } from './results';
import { CheckInEvent } from './check-in/types';

const CHALLENGE_ID = 'challenge-1' as ChallengeId;
const OWNER_ID = 'owner-1' as UserId;

function baseChallenge(successRule: SuccessRuleSnapshot): ActivatedChallengeSnapshot {
  return {
    schemaVersion: 1,
    id: CHALLENGE_ID,
    draftId: 'draft-1' as ActivatedChallengeSnapshot['draftId'],
    consequenceId: 'consequence-1' as ConsequenceId,
    ownerId: OWNER_ID,
    activatedAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    timezone: 'UTC' as ActivatedChallengeSnapshot['timezone'],
    startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    plannedEndsAt: '2026-03-08T00:00:00Z' as IsoDateTime,
    goal: 'Feel stronger',
    behavior: { description: 'Exercise', completionDefinition: 'A full workout', rule: buildRuleFor(successRule) },
    duration: { unit: 'week', value: 2 },
    successRule,
    recipients: [{ id: 'recipient-1' as RecipientId, name: 'Mom', invitationId: null }],
    rewardOrganizer: { type: 'other', name: 'Mom' },
    consequenceCategory: 'dinner',
    stake: { minorUnits: 5000, currency: 'USD' as ActivatedChallengeSnapshot['stake']['currency'] },
    sitOutAcknowledged: true,
    membershipStatusAtActivation: 'active',
    status: 'active',
    ruleEngineVersion: 1,
  };
}

function buildRuleFor(successRule: SuccessRuleSnapshot): ActivatedChallengeSnapshot['behavior']['rule'] {
  switch (successRule.direction) {
    case 'build':
      return { direction: 'build', measurement: { type: 'completion', unit: 'completion' }, rhythm: { type: 'daily', periodUnit: 'day', target: 1 } };
    case 'cut_back':
      return { direction: 'cut_back', measurement: { type: 'count', unit: 'drinks' }, boundary: { periodUnit: 'day', maximumValue: 3 } };
    case 'stop':
      return { direction: 'stop', measurement: { type: 'abstinence', unit: 'lapse' }, boundary: { periodUnit: 'challenge', maximumLapses: 0 } };
  }
}

let periodSequence = 0;
function period(overrides: Partial<ChallengePeriod>): ChallengePeriod {
  periodSequence += 1;
  return {
    schemaVersion: 1,
    id: `period-${periodSequence}` as ChallengePeriodId,
    challengeId: CHALLENGE_ID,
    periodNumber: periodSequence,
    periodKind: 'day',
    startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    endsAt: '2026-03-02T00:00:00Z' as IsoDateTime,
    target: { type: 'completion_target', target: 1 },
    ...overrides,
  };
}

let eventSequence = 0;
function event(periodId: ChallengePeriodId, overrides: Partial<CheckInEvent> & Pick<CheckInEvent, 'eventType' | 'fact'>): CheckInEvent {
  eventSequence += 1;
  return {
    schemaVersion: 1,
    id: `event-${eventSequence}` as CheckInId,
    challengeId: CHALLENGE_ID,
    ownerId: OWNER_ID,
    periodId,
    source: 'ios',
    clientRecordedAt: '2026-03-01T12:00:00Z' as IsoDateTime,
    serverRecordedAt: '2026-03-01T12:00:00Z' as IsoDateTime,
    operationId: null,
    ...overrides,
  } as CheckInEvent;
}

const NOW = '2026-04-01T00:00:00Z' as IsoDateTime;

test('an unsupported rule engine version is never evaluable', () => {
  const challenge = { ...baseChallenge(buildRule()), ruleEngineVersion: 2 as 1 };
  const result = evaluateChallenge({ challenge, periods: [], events: [], evaluatedAt: NOW });
  assert.equal(result.evaluable, false);
  assert.ok(!result.evaluable && result.reasons.includes('unsupported_rule_version'));
});

test('no generated periods means not evaluable', () => {
  const result = evaluateChallenge({ challenge: baseChallenge(buildRule()), periods: [], events: [], evaluatedAt: NOW });
  assert.equal(result.evaluable, false);
  assert.ok(!result.evaluable && result.reasons.includes('periods_not_generated'));
});

test('an event awaiting its server timestamp blocks evaluation entirely', () => {
  const p = period({ target: { type: 'completion_target', target: 1 } });
  const events = [event(p.id, { eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 }, serverRecordedAt: null })];
  const result = evaluateChallenge({ challenge: baseChallenge(buildRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, false);
  assert.ok(!result.evaluable && result.reasons.includes('events_awaiting_server_timestamp'));
});

test('a malformed event chain fails safely instead of producing a false success', () => {
  const p = period({});
  const events = [event(p.id, { eventType: 'correction', fact: { kind: 'build_completion', completions: 1 }, correctionOfEventId: 'missing' as CheckInId })];
  const result = evaluateChallenge({ challenge: baseChallenge(buildRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, false);
  assert.ok(!result.evaluable && result.reasons.includes('malformed_event_chain'));
});

test('the challenge-level result remains pending while a future period still exists', () => {
  const closedPeriod = period({ startsAt: '2026-03-01T00:00:00Z' as IsoDateTime, endsAt: '2026-03-02T00:00:00Z' as IsoDateTime });
  const upcomingPeriod = period({ startsAt: '2026-05-01T00:00:00Z' as IsoDateTime, endsAt: '2026-05-02T00:00:00Z' as IsoDateTime });
  const events = [event(closedPeriod.id, { eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } })];
  const result = evaluateChallenge({ challenge: baseChallenge(buildRule()), periods: [closedPeriod, upcomingPeriod], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, false);
  assert.ok(!result.evaluable && result.reasons.includes('periods_not_closed'));
});

test('build: aggregate threshold plus continuity together decide a daily challenge — success', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'build' }> = {
    direction: 'build', ruleVersion: 1, totalPlannedCompletions: 3, minimumRequiredCompletions: 2,
    continuitySafeguard: { type: 'maximum_consecutive_missed_days', maximum: 2 }, periodTarget: 1, periodUnit: 'day',
  };
  const p1 = period({ startsAt: '2026-03-01T00:00:00Z' as IsoDateTime, endsAt: '2026-03-02T00:00:00Z' as IsoDateTime, periodNumber: 1 });
  const p2 = period({ startsAt: '2026-03-02T00:00:00Z' as IsoDateTime, endsAt: '2026-03-03T00:00:00Z' as IsoDateTime, periodNumber: 2 });
  const p3 = period({ startsAt: '2026-03-03T00:00:00Z' as IsoDateTime, endsAt: '2026-03-04T00:00:00Z' as IsoDateTime, periodNumber: 3 });
  const events = [
    event(p1.id, { eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }),
    // p2: no check-in at all — a known, determinable 0 for build, not ambiguous.
    event(p3.id, { eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }),
  ];
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods: [p1, p2, p3], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'success');
});

test('build: a continuity violation fails the challenge even when the aggregate total alone would pass', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'build' }> = {
    direction: 'build', ruleVersion: 1, totalPlannedCompletions: 3, minimumRequiredCompletions: 1,
    continuitySafeguard: { type: 'maximum_consecutive_missed_weeks', maximum: 1 }, periodTarget: 1, periodUnit: 'week',
  };
  const p1 = period({ periodKind: 'week', startsAt: '2026-03-01T00:00:00Z' as IsoDateTime, endsAt: '2026-03-08T00:00:00Z' as IsoDateTime, periodNumber: 1 });
  const p2 = period({ periodKind: 'week', startsAt: '2026-03-08T00:00:00Z' as IsoDateTime, endsAt: '2026-03-15T00:00:00Z' as IsoDateTime, periodNumber: 2 });
  const p3 = period({ periodKind: 'week', startsAt: '2026-03-15T00:00:00Z' as IsoDateTime, endsAt: '2026-03-22T00:00:00Z' as IsoDateTime, periodNumber: 3 });
  // p1 and p2 both missed consecutively (run of 2 > maximum of 1); p3 satisfied.
  const events = [event(p3.id, { eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } })];
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods: [p1, p2, p3], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('build: the minimum_completions_per_week safeguard is a per-period floor, not a consecutive-run count', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'build' }> = {
    direction: 'build', ruleVersion: 1, totalPlannedCompletions: 6, minimumRequiredCompletions: 4,
    continuitySafeguard: { type: 'minimum_completions_per_week', minimum: 2 }, periodTarget: 3, periodUnit: 'week',
  };
  const week1 = period({ periodKind: 'week', target: { type: 'completion_target', target: 3 }, startsAt: '2026-03-01T00:00:00Z' as IsoDateTime, endsAt: '2026-03-08T00:00:00Z' as IsoDateTime, periodNumber: 1 });
  const week2 = period({ periodKind: 'week', target: { type: 'completion_target', target: 3 }, startsAt: '2026-03-08T00:00:00Z' as IsoDateTime, endsAt: '2026-03-15T00:00:00Z' as IsoDateTime, periodNumber: 2 });
  const events = [
    event(week1.id, { eventType: 'build_completion', fact: { kind: 'build_completion', completions: 3 } }),
    event(week2.id, { eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }),
  ];
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods: [week1, week2], events, evaluatedAt: NOW });
  // Aggregate (3 + 1 = 4 >= 4) alone would pass, but week 2's floor of 2 is violated.
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('stop: a challenge with no recorded lapse is a final success', () => {
  const p = period({ periodKind: 'continuous', target: { type: 'maximum_lapses', maximum: 0 } });
  const events = [event(p.id, { eventType: 'stop_intact', fact: { kind: 'stop_intact' } })];
  const result = evaluateChallenge({ challenge: baseChallenge(stopRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'success');
});

test('stop: an explicitly recorded lapse is a final failure', () => {
  const p = period({ periodKind: 'continuous', target: { type: 'maximum_lapses', maximum: 0 } });
  const events = [event(p.id, { eventType: 'stop_lapse', fact: { kind: 'stop_lapse' } })];
  const result = evaluateChallenge({ challenge: baseChallenge(stopRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('stop: no response at all by close is treated as failure under the recommended no-response policy', () => {
  const p = period({ periodKind: 'continuous', target: { type: 'maximum_lapses', maximum: 0 } });
  const result = evaluateChallenge({ challenge: baseChallenge(stopRule()), periods: [p], events: [], evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('cut_back: once closed, evaluation stays pending on the unresolved continuity policy rather than guessing', () => {
  const p = period({ target: { type: 'maximum_value', maximum: 3, measurement: { type: 'count', unit: 'drinks' } } });
  const events = [event(p.id, { eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 1, unit: 'drinks' } })];
  const result = evaluateChallenge({ challenge: baseChallenge(cutBackRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, false);
  assert.ok(!result.evaluable && result.reasons.includes('cut_back_continuity_policy_unresolved'));
  // The period-level facts are still surfaced, even though the challenge-level result is withheld.
  assert.ok(!result.evaluable && result.periodStates?.[0]?.kind === 'satisfied');
});

test('cut_back: computeCutBackAggregateOnly is introspectable without being the trusted result', () => {
  const rule = cutBackRule();
  const states: NonNullable<ReturnType<typeof evaluateChallenge>['periodStates']> = [
    { kind: 'satisfied', fact: { kind: 'cut_back_total', total: 1, unit: 'drinks' } },
    { kind: 'closed_without_input' },
    { kind: 'not_satisfied', fact: { kind: 'cut_back_total', total: 9, unit: 'drinks' } },
  ];
  const aggregate = computeCutBackAggregateOnly(rule, states);
  assert.equal(aggregate.periodsWithinLimit, 1);
  assert.equal(aggregate.ambiguousPeriodsExcludedFromWithinLimit, 1);
  assert.equal(aggregate.satisfiedByAggregateAlone, 1 >= rule.minimumPeriodsWithinLimit);
});

test('period boundaries a non-24h apart (a DST-like gap) are honored exactly as generated, with no hidden fixed-duration assumption', () => {
  const p = period({
    startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    // 23-hour period, as a spring-forward day would produce upstream.
    endsAt: '2026-03-01T23:00:00Z' as IsoDateTime,
  });
  const justBeforeClose = '2026-03-01T22:59:00Z' as IsoDateTime;
  const justAfterClose = '2026-03-01T23:00:01Z' as IsoDateTime;
  const openResult = evaluateChallenge({ challenge: baseChallenge(buildRule()), periods: [p], events: [], evaluatedAt: justBeforeClose });
  const closedResult = evaluateChallenge({ challenge: baseChallenge(buildRule()), periods: [p], events: [], evaluatedAt: justAfterClose });
  assert.ok(!openResult.evaluable && openResult.reasons.includes('periods_not_closed'));
  assert.equal(closedResult.evaluable, true);
  assert.ok(closedResult.evaluable && closedResult.status === 'failure');
});

function buildRule(): Extract<SuccessRuleSnapshot, { direction: 'build' }> {
  return {
    direction: 'build', ruleVersion: 1, totalPlannedCompletions: 1, minimumRequiredCompletions: 1,
    continuitySafeguard: { type: 'maximum_consecutive_missed_days', maximum: 2 }, periodTarget: 1, periodUnit: 'day',
  };
}

function cutBackRule(): Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> {
  return {
    direction: 'cut_back', ruleVersion: 1, measurementType: 'count', maximumAllowedValue: 3,
    periodUnit: 'day', totalPeriods: 3, minimumPeriodsWithinLimit: 2,
    continuitySafeguard: { type: 'maximum_consecutive_exceeded_days', maximum: 2 },
  };
}

function stopRule(): Extract<SuccessRuleSnapshot, { direction: 'stop' }> {
  return { direction: 'stop', ruleVersion: 1, lapseRule: { type: 'zero_lapses' } };
}
