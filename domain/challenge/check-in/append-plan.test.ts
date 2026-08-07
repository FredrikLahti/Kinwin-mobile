import assert from 'node:assert/strict';
import test from 'node:test';

import { ChallengeId, ChallengePeriodId, CheckInId, IsoDateTime, UserId } from '@/domain/challenge/types';
import { CheckInAppendRequest, planCheckInAppend } from './append-plan';
import { CheckInEvent, ClientOperationId } from './types';

const CHALLENGE_ID = 'challenge-1' as ChallengeId;
const OWNER_ID = 'owner-1' as UserId;
const PERIOD_ID = 'period-1' as ChallengePeriodId;
const PERIOD_ENDS_AT = '2026-03-02T00:00:00Z' as IsoDateTime;
const WHILE_OPEN = '2026-03-01T12:00:00Z' as IsoDateTime;
const AFTER_CLOSE = '2026-03-03T00:00:00Z' as IsoDateTime;

let eventSequence = 0;
function existingEvent(overrides: Partial<CheckInEvent> & Pick<CheckInEvent, 'eventType' | 'fact'>): CheckInEvent {
  eventSequence += 1;
  return {
    schemaVersion: 1,
    id: `event-${eventSequence}` as CheckInId,
    challengeId: CHALLENGE_ID,
    ownerId: OWNER_ID,
    periodId: PERIOD_ID,
    source: 'ios',
    clientRecordedAt: WHILE_OPEN,
    serverRecordedAt: WHILE_OPEN,
    operationId: null,
    ...overrides,
  } as CheckInEvent;
}

function baseRequest(overrides: Partial<CheckInAppendRequest> = {}): CheckInAppendRequest {
  return {
    operationId: 'op-new' as ClientOperationId,
    challengeId: CHALLENGE_ID,
    ownerId: OWNER_ID,
    periodId: PERIOD_ID,
    fact: { kind: 'stop_intact' },
    isCorrection: false,
    source: 'ios',
    clientRecordedAt: WHILE_OPEN,
    ...overrides,
  };
}

test('first check-in for an empty period plans an insert', () => {
  const plan = planCheckInAppend(baseRequest(), [], { now: WHILE_OPEN, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'insert', eventType: 'stop_intact' });
});

test('duplicate retry: same operation id and same fact is a safe idempotent replay', () => {
  const opId = 'op-1' as ClientOperationId;
  const existing = existingEvent({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, operationId: opId });
  const request = baseRequest({ operationId: opId, fact: { kind: 'stop_intact' } });
  const plan = planCheckInAppend(request, [existing], { now: WHILE_OPEN, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'idempotent_replay', existingEventId: existing.id });
});

test('same operation id with a conflicting fact is rejected, never silently reinterpreted', () => {
  const opId = 'op-1' as ClientOperationId;
  const existing = existingEvent({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 2, unit: 'times' }, operationId: opId });
  const request = baseRequest({ operationId: opId, fact: { kind: 'cut_back_total', total: 9, unit: 'times' } });
  const plan = planCheckInAppend(request, [existing], { now: WHILE_OPEN, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'rejected', reason: 'operation_id_conflict' });
});

test('a second, non-correction declaration for an already-decided period is rejected — must be explicit', () => {
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const request = baseRequest({ fact: { kind: 'build_completion', completions: 2 } });
  const plan = planCheckInAppend(request, [existing], { now: WHILE_OPEN, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'rejected', reason: 'unflagged_redeclaration' });
});

test('a genuine correction while the period is still open plans an insert', () => {
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const request = baseRequest({
    fact: { kind: 'build_completion', completions: 0 },
    isCorrection: true,
    correctionOfEventId: existing.id,
  });
  const plan = planCheckInAppend(request, [existing], { now: WHILE_OPEN, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'insert', eventType: 'correction' });
});

test('a correction attempted after the period has closed is rejected', () => {
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const request = baseRequest({
    fact: { kind: 'build_completion', completions: 0 },
    isCorrection: true,
    correctionOfEventId: existing.id,
  });
  const plan = planCheckInAppend(request, [existing], { now: AFTER_CLOSE, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'rejected', reason: 'period_closed_for_correction' });
});

test('a correction targeting a stale, already-superseded event is rejected', () => {
  const original = existingEvent({ eventType: 'stop_intact', fact: { kind: 'stop_intact' } });
  const laterCorrection = existingEvent({ eventType: 'correction', fact: { kind: 'stop_lapse' }, correctionOfEventId: original.id });
  const request = baseRequest({ fact: { kind: 'stop_intact' }, isCorrection: true, correctionOfEventId: original.id });
  const plan = planCheckInAppend(request, [original, laterCorrection], { now: WHILE_OPEN, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'rejected', reason: 'correction_target_mismatch' });
});

test('a correction with nothing to correct is rejected', () => {
  const request = baseRequest({ isCorrection: true, correctionOfEventId: 'nonexistent' as CheckInId });
  const plan = planCheckInAppend(request, [], { now: WHILE_OPEN, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'rejected', reason: 'correction_without_prior_entry' });
});

test('an already-malformed history refuses to plan anything new on top of it', () => {
  const orphanCorrection = existingEvent({ eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: 'missing' as CheckInId });
  const plan = planCheckInAppend(baseRequest(), [orphanCorrection], { now: WHILE_OPEN, periodEndsAt: PERIOD_ENDS_AT });
  assert.deepEqual(plan, { kind: 'rejected', reason: 'malformed_existing_history' });
});
