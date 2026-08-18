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
import { evaluateChallenge } from './results';
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
function period(overrides: Partial<ChallengePeriod> = {}): ChallengePeriod {
  periodSequence += 1;
  const endsAt = overrides.endsAt ?? ('2026-03-02T00:00:00Z' as IsoDateTime);
  return {
    schemaVersion: 1,
    id: `period-${periodSequence}` as ChallengePeriodId,
    challengeId: CHALLENGE_ID,
    periodNumber: periodSequence,
    periodKind: 'day',
    startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    endsAt,
    // Defaults to endsAt (no reporting-window gap) unless a test explicitly
    // overrides it — most tests here aren't exercising the reporting-window
    // distinction (see check-in/append-plan.test.ts and
    // check-in/period-state.test.ts for that), just build/cut_back/stop
    // outcomes once a period is settled.
    reportingClosesAt: endsAt,
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
    // p2: no check-in at all — no input was received; the locked no-response policy contributes nothing toward the aggregate for it.
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

// --- Success Means (ruleVersion 2): the result evaluator must actually use
// the user-selected stricter threshold, not silently fall back to the V1
// baseline. Exact boundary from the founder's brief: Build baseline=25/28,
// selected=27/28 — 27 completions satisfies the threshold, 26 fails it
// (continuity safeguard still applies either way). See docs/PRODUCT_DECISIONS.md.

function dailyBuildPeriods(missedIndexes: readonly number[], total: number): { periods: ChallengePeriod[]; events: CheckInEvent[] } {
  const periods: ChallengePeriod[] = [];
  const events: CheckInEvent[] = [];
  for (let index = 0; index < total; index += 1) {
    const startsAt = new Date(Date.UTC(2026, 2, 1 + index)).toISOString() as IsoDateTime;
    const endsAt = new Date(Date.UTC(2026, 2, 2 + index)).toISOString() as IsoDateTime;
    const p = period({ startsAt, endsAt, target: { type: 'completion_target', target: 1 }, periodNumber: index + 1 });
    periods.push(p);
    if (!missedIndexes.includes(index)) {
      events.push(event(p.id, { eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }));
    }
  }
  return { periods, events };
}

test('build ruleVersion 2: a stricter selected threshold is what actually decides the result — 27 of 28 satisfies it', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'build' }> = {
    direction: 'build', ruleVersion: 2, totalPlannedCompletions: 28, minimumRequiredCompletions: 27,
    continuitySafeguard: { type: 'maximum_consecutive_missed_days', maximum: 2 }, periodTarget: 1, periodUnit: 'day',
  };
  // Single missed day (index 13) — 27 of 28 completed, continuity trivially intact (a run of 1).
  const { periods, events } = dailyBuildPeriods([13], 28);
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods, events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'success', 'the V1 baseline of 25/28 would pass this too — this only proves V2 does not reject a valid stricter pass');
});

test('build ruleVersion 2: falling one short of the stricter selected threshold fails, even though the V1 baseline of 25/28 would have passed', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'build' }> = {
    direction: 'build', ruleVersion: 2, totalPlannedCompletions: 28, minimumRequiredCompletions: 27,
    continuitySafeguard: { type: 'maximum_consecutive_missed_days', maximum: 2 }, periodTarget: 1, periodUnit: 'day',
  };
  // Two non-consecutive missed days (indexes 5 and 20) — 26 of 28 completed.
  // Continuity stays intact (no run longer than 1), isolating this failure
  // to the aggregate threshold alone: this is the exact regression the
  // founder's brief warned about — Review showing 27/28 while the
  // evaluator silently still used the old 25/28 baseline would wrongly
  // pass this case.
  const { periods, events } = dailyBuildPeriods([5, 20], 28);
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods, events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('cut_back ruleVersion 2: a stricter selected threshold is what actually decides the result — 27 of 28 within limit satisfies it', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> = {
    direction: 'cut_back', ruleVersion: 2, measurementType: 'count', maximumAllowedValue: 3,
    periodUnit: 'day', totalPeriods: 28, minimumPeriodsWithinLimit: 27,
    continuitySafeguard: { type: 'maximum_consecutive_exceeded_days', maximum: 2 },
  };
  const totals = Array.from({ length: 28 }, (_, index) => (index === 13 ? 9 : 1));
  const { periods, events } = cutBackPeriodsAt(totals, rule);
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods, events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'success');
});

test('cut_back ruleVersion 2: falling one short of the stricter selected threshold fails, even though the V1 baseline of 25/28 would have passed', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> = {
    direction: 'cut_back', ruleVersion: 2, measurementType: 'count', maximumAllowedValue: 3,
    periodUnit: 'day', totalPeriods: 28, minimumPeriodsWithinLimit: 27,
    continuitySafeguard: { type: 'maximum_consecutive_exceeded_days', maximum: 2 },
  };
  // Two non-consecutive exceeded days — 26 of 28 within limit, continuity intact.
  const totals = Array.from({ length: 28 }, (_, index) => (index === 5 || index === 20 ? 9 : 1));
  const { periods, events } = cutBackPeriodsAt(totals, rule);
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods, events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

// Like cutBackPeriods above, but with proper date arithmetic instead of
// single-digit day-of-month string interpolation, so it can generate more
// than 9 periods (needed for the 28-period Success Means boundary tests).
function cutBackPeriodsAt(totals: readonly (number | null)[], rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }>): { periods: ChallengePeriod[]; events: CheckInEvent[] } {
  const periods: ChallengePeriod[] = [];
  const events: CheckInEvent[] = [];
  totals.forEach((total, index) => {
    const startsAt = new Date(Date.UTC(2026, 2, 1 + index)).toISOString() as IsoDateTime;
    const endsAt = new Date(Date.UTC(2026, 2, 2 + index)).toISOString() as IsoDateTime;
    const p = period({ startsAt, endsAt, target: { type: 'maximum_value', maximum: rule.maximumAllowedValue, measurement: { type: 'count', unit: 'drinks' } }, periodNumber: index + 1 });
    periods.push(p);
    if (total !== null) events.push(event(p.id, { eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total, unit: 'drinks' } }));
  });
  return { periods, events };
}

// --- Stop: sticky-lapse semantics at the challenge level (see check-in/period-state.test.ts for the unit-level coverage) ---

function stopPeriodWithReportingWindow(): ChallengePeriod {
  return period({
    periodKind: 'continuous',
    target: { type: 'maximum_lapses', maximum: 0 },
    endsAt: '2026-03-02T00:00:00Z' as IsoDateTime,
    reportingClosesAt: '2026-03-03T00:00:00Z' as IsoDateTime,
  });
}

test('stop: a final intact attestation after tracking ends is a final success', () => {
  const p = stopPeriodWithReportingWindow();
  const events = [event(p.id, {
    eventType: 'stop_intact', fact: { kind: 'stop_intact' },
    clientRecordedAt: '2026-03-02T12:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T12:00:00Z' as IsoDateTime,
  })];
  const result = evaluateChallenge({ challenge: baseChallenge(stopRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'success');
});

test('stop: an explicitly recorded, uncorrected lapse is a final failure regardless of when it happened', () => {
  const p = stopPeriodWithReportingWindow();
  const events = [event(p.id, { eventType: 'stop_lapse', fact: { kind: 'stop_lapse' } })];
  const result = evaluateChallenge({ challenge: baseChallenge(stopRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('stop: an early intact ping alone, with no final attestation, is a final failure — not an automatic success', () => {
  const p = stopPeriodWithReportingWindow();
  // Only an early ping, during tracking — never a final attestation after endsAt.
  const events = [event(p.id, { eventType: 'stop_intact', fact: { kind: 'stop_intact' } })];
  const result = evaluateChallenge({ challenge: baseChallenge(stopRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('stop: a lapse followed by a later ordinary intact attestation is still a final failure', () => {
  const p = stopPeriodWithReportingWindow();
  const events = [
    event(p.id, { eventType: 'stop_lapse', fact: { kind: 'stop_lapse' } }),
    event(p.id, {
      eventType: 'stop_intact', fact: { kind: 'stop_intact' },
      clientRecordedAt: '2026-03-02T12:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T12:00:00Z' as IsoDateTime,
    }),
  ];
  const result = evaluateChallenge({ challenge: baseChallenge(stopRule()), periods: [p], events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('stop: no response at all by close is treated as failure under the locked no-response policy', () => {
  const p = stopPeriodWithReportingWindow();
  const result = evaluateChallenge({ challenge: baseChallenge(stopRule()), periods: [p], events: [], evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

// --- Cut back: locked V1 evaluator — aggregate threshold AND continuity safeguard, both required ---

function cutBackPeriods(totals: readonly (number | null)[], rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }>): { periods: ChallengePeriod[]; events: CheckInEvent[] } {
  const periods: ChallengePeriod[] = [];
  const events: CheckInEvent[] = [];
  totals.forEach((total, index) => {
    const startsAt = `2026-03-0${index + 1}T00:00:00Z` as IsoDateTime;
    const endsAt = `2026-03-0${index + 2}T00:00:00Z` as IsoDateTime;
    const p = period({ startsAt, endsAt, target: { type: 'maximum_value', maximum: rule.maximumAllowedValue, measurement: { type: 'count', unit: 'drinks' } }, periodNumber: index + 1 });
    periods.push(p);
    if (total !== null) events.push(event(p.id, { eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total, unit: 'drinks' } }));
  });
  return { periods, events };
}

test('cut_back: aggregate threshold met and continuity intact — success', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> = {
    direction: 'cut_back', ruleVersion: 1, measurementType: 'count', maximumAllowedValue: 3,
    periodUnit: 'day', totalPeriods: 3, minimumPeriodsWithinLimit: 2,
    continuitySafeguard: { type: 'maximum_consecutive_exceeded_days', maximum: 2 },
  };
  // p1, p2 within limit; p3 exceeds — a single-period exceeded run, well within the maximum of 2.
  const { periods, events } = cutBackPeriods([1, 2, 9], rule);
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods, events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'success');
});

test('cut_back: continuity is violated even though the aggregate threshold alone would pass', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> = {
    direction: 'cut_back', ruleVersion: 1, measurementType: 'count', maximumAllowedValue: 3,
    periodUnit: 'day', totalPeriods: 4, minimumPeriodsWithinLimit: 1,
    continuitySafeguard: { type: 'maximum_consecutive_exceeded_days', maximum: 2 },
  };
  // p1 within (aggregate satisfied: 1 >= 1); p2, p3, p4 exceed consecutively — a run of 3 > the locked maximum of 2.
  const { periods, events } = cutBackPeriods([1, 9, 9, 9], rule);
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods, events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('cut_back: the aggregate threshold alone is not met, even though continuity would be fine', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> = {
    direction: 'cut_back', ruleVersion: 1, measurementType: 'count', maximumAllowedValue: 3,
    periodUnit: 'day', totalPeriods: 3, minimumPeriodsWithinLimit: 3,
    continuitySafeguard: { type: 'maximum_consecutive_exceeded_days', maximum: 2 },
  };
  // Only 2 of 3 periods within limit — minimumPeriodsWithinLimit of 3 is not met — despite the single exceeded period being well within continuity.
  const { periods, events } = cutBackPeriods([1, 2, 9], rule);
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods, events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
});

test('cut_back: a period closed without a required report counts as exceeded toward continuity', () => {
  const rule: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> = {
    direction: 'cut_back', ruleVersion: 1, measurementType: 'count', maximumAllowedValue: 3,
    periodUnit: 'day', totalPeriods: 4, minimumPeriodsWithinLimit: 1,
    continuitySafeguard: { type: 'maximum_consecutive_exceeded_days', maximum: 2 },
  };
  // p1 within (aggregate satisfied); p2, p3, p4 never reported at all — a consecutive no-response run of 3 > the locked maximum of 2.
  const { periods, events } = cutBackPeriods([1, null, null, null], rule);
  const result = evaluateChallenge({ challenge: baseChallenge(rule), periods, events, evaluatedAt: NOW });
  assert.equal(result.evaluable, true);
  assert.ok(result.evaluable && result.status === 'failure');
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

function stopRule(): Extract<SuccessRuleSnapshot, { direction: 'stop' }> {
  return { direction: 'stop', ruleVersion: 1, lapseRule: { type: 'zero_lapses' } };
}
