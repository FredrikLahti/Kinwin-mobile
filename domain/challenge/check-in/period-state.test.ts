import assert from 'node:assert/strict';
import test from 'node:test';

import { ChallengePeriod } from '@/domain/challenge/periods';
import { ChallengeId, ChallengePeriodId, CheckInId, IsoDateTime, UserId } from '@/domain/challenge/types';
import { derivePeriodState } from './period-state';
import { CheckInEvent } from './types';

const CHALLENGE_ID = 'challenge-1' as ChallengeId;
const OWNER_ID = 'owner-1' as UserId;

const dayPeriod = (overrides: Partial<ChallengePeriod> = {}): ChallengePeriod => ({
  schemaVersion: 1,
  id: 'period-1' as ChallengePeriodId,
  challengeId: CHALLENGE_ID,
  periodNumber: 1,
  periodKind: 'day',
  startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
  endsAt: '2026-03-02T00:00:00Z' as IsoDateTime,
  target: { type: 'completion_target', target: 1 },
  ...overrides,
});

let eventSequence = 0;
function event(overrides: Partial<CheckInEvent> & Pick<CheckInEvent, 'eventType' | 'fact'>, periodId: ChallengePeriodId): CheckInEvent {
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

test('a period that has not started yet is upcoming, regardless of events', () => {
  const period = dayPeriod();
  const result = derivePeriodState(period, [], '2026-02-28T00:00:00Z' as IsoDateTime);
  assert.deepEqual(result, { ok: true, state: { kind: 'upcoming' } });
});

test('a period within its window is open, carrying whatever fact has been recorded so far', () => {
  const period = dayPeriod();
  const e = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }, period.id);
  const result = derivePeriodState(period, [e], '2026-03-01T12:00:00Z' as IsoDateTime);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'open' && result.state.fact?.kind === 'build_completion');
});

test('a closed build period meeting its target is satisfied', () => {
  const period = dayPeriod();
  const e = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }, period.id);
  const result = derivePeriodState(period, [e], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.deepEqual(result, { ok: true, state: { kind: 'satisfied', fact: { kind: 'build_completion', completions: 1 } } });
});

test('a closed build period falling short of its target is not satisfied', () => {
  const period = dayPeriod({ target: { type: 'completion_target', target: 3 } });
  const e = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }, period.id);
  const result = derivePeriodState(period, [e], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'not_satisfied');
});

test('a closed period with no recorded fact at all is closed_without_input, not not_satisfied', () => {
  const period = dayPeriod();
  const result = derivePeriodState(period, [], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.deepEqual(result, { ok: true, state: { kind: 'closed_without_input' } });
});

test('a cut-back period within its limit is satisfied', () => {
  const period = dayPeriod({ target: { type: 'maximum_value', maximum: 5, measurement: { type: 'count', unit: 'drinks' } } });
  const e = event({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 3, unit: 'drinks' } }, period.id);
  const result = derivePeriodState(period, [e], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'satisfied');
});

test('a cut-back period exceeding its limit is not satisfied', () => {
  const period = dayPeriod({ target: { type: 'maximum_value', maximum: 5, measurement: { type: 'count', unit: 'drinks' } } });
  const e = event({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 7, unit: 'drinks' } }, period.id);
  const result = derivePeriodState(period, [e], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'not_satisfied');
});

test('a stop period with an intact status is satisfied', () => {
  const period = dayPeriod({ periodKind: 'continuous', target: { type: 'maximum_lapses', maximum: 0 } });
  const e = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' } }, period.id);
  const result = derivePeriodState(period, [e], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'satisfied');
});

test('a stop period with a lapse is not satisfied', () => {
  const period = dayPeriod({ periodKind: 'continuous', target: { type: 'maximum_lapses', maximum: 0 } });
  const e = event({ eventType: 'stop_lapse', fact: { kind: 'stop_lapse' } }, period.id);
  const result = derivePeriodState(period, [e], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'not_satisfied');
});

test('a fact whose kind does not match the period target shape fails safely rather than guessing', () => {
  const period = dayPeriod({ target: { type: 'maximum_value', maximum: 5, measurement: { type: 'count', unit: 'drinks' } } });
  const e = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }, period.id);
  const result = derivePeriodState(period, [e], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.equal(result.ok, false);
});

test('a malformed underlying event chain propagates as a failed period-state derivation', () => {
  const period = dayPeriod();
  const orphanCorrection = event(
    { eventType: 'correction', fact: { kind: 'build_completion', completions: 1 }, correctionOfEventId: 'missing' as CheckInId },
    period.id,
  );
  const result = derivePeriodState(period, [orphanCorrection], '2026-03-02T00:00:00Z' as IsoDateTime);
  assert.equal(result.ok, false);
});
