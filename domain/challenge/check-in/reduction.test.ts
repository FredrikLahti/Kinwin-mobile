import assert from 'node:assert/strict';
import test from 'node:test';

import { ChallengeId, ChallengePeriodId, CheckInId, IsoDateTime, UserId } from '@/domain/challenge/types';
import { reduceEffectiveFact } from './reduction';
import { CheckInEvent, ClientOperationId } from './types';

const CHALLENGE_ID = 'challenge-1' as ChallengeId;
const OWNER_ID = 'owner-1' as UserId;
const PERIOD_ID = 'period-1' as ChallengePeriodId;
const OTHER_PERIOD_ID = 'period-2' as ChallengePeriodId;

let eventSequence = 0;
function event(overrides: Partial<CheckInEvent> & Pick<CheckInEvent, 'eventType' | 'fact'>): CheckInEvent {
  eventSequence += 1;
  return {
    schemaVersion: 1,
    id: `event-${eventSequence}` as CheckInId,
    challengeId: CHALLENGE_ID,
    ownerId: OWNER_ID,
    periodId: PERIOD_ID,
    source: 'ios',
    clientRecordedAt: '2026-01-01T10:00:00Z' as IsoDateTime,
    serverRecordedAt: `2026-01-01T10:00:0${eventSequence}Z` as IsoDateTime,
    operationId: null,
    ...overrides,
  } as CheckInEvent;
}

test('first check-in: a single original event becomes the effective fact', () => {
  const first = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const result = reduceEffectiveFact(PERIOD_ID, [first]);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.effective?.winningEventId === first.id);
});

test('no events for a period reduces to no effective fact, not an error', () => {
  const result = reduceEffectiveFact(PERIOD_ID, []);
  assert.deepEqual(result, { ok: true, effective: null });
});

test('duplicate retry: two events with the same operation id and the same fact reduce cleanly', () => {
  const opId = 'op-1' as ClientOperationId;
  const first = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, operationId: opId });
  const retry = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, operationId: opId });
  const result = reduceEffectiveFact(PERIOD_ID, [first, retry]);
  assert.equal(result.ok, true);
});

test('conflicting events sharing the same operation id fail safely', () => {
  const opId = 'op-1' as ClientOperationId;
  const first = event({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 2, unit: 'times' }, operationId: opId });
  const conflicting = event({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 5, unit: 'times' }, operationId: opId });
  const result = reduceEffectiveFact(PERIOD_ID, [first, conflicting]);
  assert.equal(result.ok, false);
});

test('a genuine correction replaces the effective fact and records the winning event', () => {
  const original = event({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 2, unit: 'times' } });
  const correction = event({ eventType: 'correction', fact: { kind: 'cut_back_total', total: 1, unit: 'times' }, correctionOfEventId: original.id });
  const result = reduceEffectiveFact(PERIOD_ID, [original, correction]);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.effective?.fact.kind === 'cut_back_total' && (result.effective.fact as { total: number }).total === 1);
  assert.ok(result.ok && result.effective?.winningEventId === correction.id);
});

test('a correction chain resolves to the latest correction, keeping the whole chain intact as input', () => {
  const original = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' } });
  const correctionA = event({ eventType: 'correction', fact: { kind: 'stop_lapse' }, correctionOfEventId: original.id });
  const correctionB = event({ eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: correctionA.id });
  const result = reduceEffectiveFact(PERIOD_ID, [original, correctionA, correctionB]);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.effective?.winningEventId === correctionB.id);
  assert.ok(result.ok && result.effective?.fact.kind === 'stop_intact');
});

test('a second original entry for an already-decided period fails safely instead of guessing', () => {
  const first = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const secondOriginal = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 2 } });
  const result = reduceEffectiveFact(PERIOD_ID, [first, secondOriginal]);
  assert.equal(result.ok, false);
});

test('a correction with no prior entry to correct fails safely', () => {
  const orphanCorrection = event({ eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: 'nonexistent' as CheckInId });
  const result = reduceEffectiveFact(PERIOD_ID, [orphanCorrection]);
  assert.equal(result.ok, false);
});

test('a correction targeting a stale (already-superseded) event fails safely', () => {
  const original = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' } });
  const correctionA = event({ eventType: 'correction', fact: { kind: 'stop_lapse' }, correctionOfEventId: original.id });
  // Targets the original, not correctionA, even though correctionA is now effective.
  const staleCorrection = event({ eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: original.id });
  const result = reduceEffectiveFact(PERIOD_ID, [original, correctionA, staleCorrection]);
  assert.equal(result.ok, false);
});

test('an event whose periodId does not match the period being reduced fails safely', () => {
  const wrongPeriod = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, periodId: OTHER_PERIOD_ID });
  const result = reduceEffectiveFact(PERIOD_ID, [wrongPeriod]);
  assert.equal(result.ok, false);
});

test('events awaiting a server timestamp are excluded from reduction rather than trusted', () => {
  const untrusted = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 3 }, serverRecordedAt: null });
  const result = reduceEffectiveFact(PERIOD_ID, [untrusted]);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.effective === null);
});
