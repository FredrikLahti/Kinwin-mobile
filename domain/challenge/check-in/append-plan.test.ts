import assert from 'node:assert/strict';
import test from 'node:test';

import { ChallengePeriod } from '@/domain/challenge/periods';
import { ChallengeId, ChallengePeriodId, CheckInId, IsoDateTime, UserId } from '@/domain/challenge/types';
import { CheckInAppendRequest, planCheckInAppend } from './append-plan';
import { CheckInEvent, ClientOperationId } from './types';

const CHALLENGE_ID = 'challenge-1' as ChallengeId;
const OWNER_ID = 'owner-1' as UserId;
const PERIOD_ID = 'period-1' as ChallengePeriodId;
const OTHER_PERIOD_ID = 'period-2' as ChallengePeriodId;
const PERIOD_ENDS_AT = '2026-03-02T00:00:00Z' as IsoDateTime;
const REPORTING_CLOSES_AT = '2026-03-02T12:00:00Z' as IsoDateTime;
const WHILE_TRACKING = '2026-03-01T12:00:00Z' as IsoDateTime;
const AFTER_TRACKING_WITHIN_WINDOW = '2026-03-02T06:00:00Z' as IsoDateTime;
const AFTER_DEADLINE = '2026-03-03T00:00:00Z' as IsoDateTime;

const buildPeriod: ChallengePeriod = {
  schemaVersion: 1,
  id: PERIOD_ID,
  challengeId: CHALLENGE_ID,
  periodNumber: 1,
  periodKind: 'day',
  startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
  endsAt: PERIOD_ENDS_AT,
  reportingClosesAt: REPORTING_CLOSES_AT,
  target: { type: 'completion_target', target: 1 },
};

const stopPeriod: ChallengePeriod = { ...buildPeriod, periodKind: 'continuous', target: { type: 'maximum_lapses', maximum: 0 } };

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
    clientRecordedAt: WHILE_TRACKING,
    serverRecordedAt: WHILE_TRACKING,
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
    fact: { kind: 'build_completion', completions: 1 },
    isCorrection: false,
    source: 'ios',
    clientRecordedAt: WHILE_TRACKING,
    ...overrides,
  };
}

/**
 * Test-only convenience wrapper: `existingEventForOperationId` defaults to a
 * lookup within `eventsForPeriod` by the request's own operation id, since
 * most scenarios below don't care about the challenge-scoped vs.
 * period-local distinction. Tests that DO care (cross-period operation id
 * reuse) pass it explicitly instead.
 */
function plan(
  request: CheckInAppendRequest,
  eventsForPeriod: readonly CheckInEvent[],
  context: { readonly now: IsoDateTime; readonly period: ChallengePeriod },
  existingEventForOperationId?: CheckInEvent | null,
) {
  const lookup = existingEventForOperationId !== undefined
    ? existingEventForOperationId
    : eventsForPeriod.find((event) => event.operationId === request.operationId) ?? null;
  return planCheckInAppend(request, eventsForPeriod, lookup, context);
}

test('first check-in for an empty period plans an insert', () => {
  const p = plan(baseRequest(), [], { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'insert', eventType: 'build_completion' });
});

test('duplicate retry: same operation id and same fact is a safe idempotent replay', () => {
  const opId = 'op-1' as ClientOperationId;
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 }, operationId: opId });
  const request = baseRequest({ operationId: opId, fact: { kind: 'build_completion', completions: 1 } });
  const p = plan(request, [existing], { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'idempotent_replay', existingEventId: existing.id });
});

test('same operation id with a conflicting fact is rejected, never silently reinterpreted', () => {
  const opId = 'op-1' as ClientOperationId;
  const existing = existingEvent({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 2, unit: 'times' }, operationId: opId });
  const request = baseRequest({ operationId: opId, fact: { kind: 'cut_back_total', total: 9, unit: 'times' } });
  const p = plan(request, [existing], { now: WHILE_TRACKING, period: { ...buildPeriod, target: { type: 'maximum_value', maximum: 5, measurement: { type: 'count', unit: 'times' } } } });
  assert.deepEqual(p, { kind: 'rejected', reason: 'operation_id_conflict' });
});

test('a second, non-correction declaration for an already-decided build period is rejected — must be explicit', () => {
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const request = baseRequest({ fact: { kind: 'build_completion', completions: 2 } });
  const p = plan(request, [existing], { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'unflagged_redeclaration' });
});

test('a genuine correction while still within the reporting window plans an insert', () => {
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const request = baseRequest({
    fact: { kind: 'build_completion', completions: 0 },
    isCorrection: true,
    correctionOfEventId: existing.id,
  });
  const p = plan(request, [existing], { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'insert', eventType: 'correction' });
});

test('a correction attempted after the reporting deadline is rejected', () => {
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const request = baseRequest({
    fact: { kind: 'build_completion', completions: 0 },
    isCorrection: true,
    correctionOfEventId: existing.id,
  });
  const p = plan(request, [existing], { now: AFTER_DEADLINE, period: buildPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'reporting_deadline_passed' });
});

test('a correction targeting a stale, already-superseded event is rejected', () => {
  const original = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const laterCorrection = existingEvent({ eventType: 'correction', fact: { kind: 'build_completion', completions: 2 }, correctionOfEventId: original.id });
  const request = baseRequest({ fact: { kind: 'build_completion', completions: 3 }, isCorrection: true, correctionOfEventId: original.id });
  const p = plan(request, [original, laterCorrection], { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'correction_target_mismatch' });
});

test('a correction with nothing to correct is rejected', () => {
  const request = baseRequest({ isCorrection: true, correctionOfEventId: 'nonexistent' as CheckInId });
  const p = plan(request, [], { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'correction_without_prior_entry' });
});

test('an already-malformed history refuses to plan anything new on top of it', () => {
  const orphanCorrection = existingEvent({ eventType: 'correction', fact: { kind: 'build_completion', completions: 1 }, correctionOfEventId: 'missing' as CheckInId });
  const p = plan(baseRequest(), [orphanCorrection], { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'malformed_existing_history' });
});

// --- Reporting-window model: deadline gates first reports too, not only corrections ---

test('a late-but-within-window first report (after tracking end, before the reporting deadline) is accepted', () => {
  const p = plan(baseRequest(), [], { now: AFTER_TRACKING_WITHIN_WINDOW, period: buildPeriod });
  assert.deepEqual(p, { kind: 'insert', eventType: 'build_completion' });
});

test('a late-but-within-window correction is accepted', () => {
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } });
  const request = baseRequest({ fact: { kind: 'build_completion', completions: 0 }, isCorrection: true, correctionOfEventId: existing.id });
  const p = plan(request, [existing], { now: AFTER_TRACKING_WITHIN_WINDOW, period: buildPeriod });
  assert.deepEqual(p, { kind: 'insert', eventType: 'correction' });
});

test('a first report submitted after the reporting deadline is rejected', () => {
  const p = plan(baseRequest(), [], { now: AFTER_DEADLINE, period: buildPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'reporting_deadline_passed' });
});

test('an idempotent replay of an already-accepted operation still succeeds after the reporting deadline', () => {
  const opId = 'op-1' as ClientOperationId;
  const existing = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 }, operationId: opId });
  const request = baseRequest({ operationId: opId, fact: { kind: 'build_completion', completions: 1 } });
  const p = plan(request, [existing], { now: AFTER_DEADLINE, period: buildPeriod });
  assert.deepEqual(p, { kind: 'idempotent_replay', existingEventId: existing.id });
});

// --- Stop: repeated ordinary originals are valid, not an unflagged redeclaration ---

test('stop: a second, non-correction stop_intact declaration is accepted as ordinary history', () => {
  const existing = existingEvent({ eventType: 'stop_intact', fact: { kind: 'stop_intact' } });
  const request = baseRequest({ fact: { kind: 'stop_intact' } });
  const p = plan(request, [existing], { now: WHILE_TRACKING, period: stopPeriod });
  assert.deepEqual(p, { kind: 'insert', eventType: 'stop_intact' });
});

test('stop: a correction must target an existing, not-yet-superseded entry', () => {
  const lapse = existingEvent({ eventType: 'stop_lapse', fact: { kind: 'stop_lapse' } });
  const request = baseRequest({ fact: { kind: 'stop_intact' }, isCorrection: true, correctionOfEventId: lapse.id });
  const p = plan(request, [lapse], { now: WHILE_TRACKING, period: stopPeriod });
  assert.deepEqual(p, { kind: 'insert', eventType: 'correction' });
});

test('stop: a correction targeting an already-superseded lapse is rejected', () => {
  const lapse = existingEvent({ eventType: 'stop_lapse', fact: { kind: 'stop_lapse' } });
  const alreadyCorrected = existingEvent({ eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: lapse.id });
  const request = baseRequest({ fact: { kind: 'stop_lapse' }, isCorrection: true, correctionOfEventId: lapse.id });
  const p = plan(request, [lapse, alreadyCorrected], { now: WHILE_TRACKING, period: stopPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'correction_target_mismatch' });
});

// --- Challenge-scoped idempotency: idempotency_key is unique per challenge, not per period ---

test('an operation id unused anywhere in the challenge (null lookup) plans normally, even with unrelated period-local history', () => {
  const unrelated = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 }, operationId: 'op-unrelated' as ClientOperationId });
  const request = baseRequest({ operationId: 'op-new' as ClientOperationId, isCorrection: true, correctionOfEventId: unrelated.id });
  const p = planCheckInAppend(request, [unrelated], null, { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'insert', eventType: 'correction' });
});

test('an operation id already used for a different period of the same challenge is a conflict, not a replay', () => {
  const opId = 'op-1' as ClientOperationId;
  const existingInOtherPeriod = existingEvent({
    eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 },
    operationId: opId, periodId: OTHER_PERIOD_ID,
  });
  // This period's own history is empty — the reused id lives in a different period entirely,
  // which existingEventsForPeriod (period-local) would never surface on its own.
  const request = baseRequest({ operationId: opId, periodId: PERIOD_ID, fact: { kind: 'build_completion', completions: 1 } });
  const p = planCheckInAppend(request, [], existingInOtherPeriod, { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'operation_id_conflict' });
});

test('an operation id reused with a conflicting event type across periods is a conflict', () => {
  const opId = 'op-1' as ClientOperationId;
  const existingInOtherPeriod = existingEvent({
    eventType: 'stop_lapse', fact: { kind: 'stop_lapse' },
    operationId: opId, periodId: OTHER_PERIOD_ID,
  });
  const request = baseRequest({ operationId: opId, periodId: PERIOD_ID, fact: { kind: 'build_completion', completions: 1 } });
  const p = planCheckInAppend(request, [], existingInOtherPeriod, { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'rejected', reason: 'operation_id_conflict' });
});

test('an operation id reused for the same period and fact is still a safe replay, independent of period-local history', () => {
  const opId = 'op-1' as ClientOperationId;
  const existingForOperation = existingEvent({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 }, operationId: opId, periodId: PERIOD_ID });
  const request = baseRequest({ operationId: opId, periodId: PERIOD_ID, fact: { kind: 'build_completion', completions: 1 } });
  const p = planCheckInAppend(request, [], existingForOperation, { now: WHILE_TRACKING, period: buildPeriod });
  assert.deepEqual(p, { kind: 'idempotent_replay', existingEventId: existingForOperation.id });
});
