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
  reportingClosesAt: '2026-03-02T12:00:00Z' as IsoDateTime,
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

test('a period past tracking end but still before its reporting deadline stays open, not closed', () => {
  const period = dayPeriod();
  const result = derivePeriodState(period, [], '2026-03-02T06:00:00Z' as IsoDateTime);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'open');
});

test('a build period meeting its target after the reporting deadline is satisfied', () => {
  const period = dayPeriod();
  const e = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }, period.id);
  const result = derivePeriodState(period, [e], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'satisfied', fact: { kind: 'build_completion', completions: 1 } } });
});

test('a build period falling short of its target after the reporting deadline is not satisfied', () => {
  const period = dayPeriod({ target: { type: 'completion_target', target: 3 } });
  const e = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }, period.id);
  const result = derivePeriodState(period, [e], period.reportingClosesAt);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'not_satisfied');
});

test('a period with no recorded fact after its reporting deadline is closed_without_input, not not_satisfied', () => {
  const period = dayPeriod();
  const result = derivePeriodState(period, [], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'closed_without_input' } });
});

test('a cut-back period within its limit is satisfied', () => {
  const period = dayPeriod({ target: { type: 'maximum_value', maximum: 5, measurement: { type: 'count', unit: 'drinks' } } });
  const e = event({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 3, unit: 'drinks' } }, period.id);
  const result = derivePeriodState(period, [e], period.reportingClosesAt);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'satisfied');
});

test('a cut-back period exceeding its limit is not satisfied', () => {
  const period = dayPeriod({ target: { type: 'maximum_value', maximum: 5, measurement: { type: 'count', unit: 'drinks' } } });
  const e = event({ eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 7, unit: 'drinks' } }, period.id);
  const result = derivePeriodState(period, [e], period.reportingClosesAt);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.kind === 'not_satisfied');
});

test('a fact whose kind does not match the period target shape fails safely rather than guessing', () => {
  const period = dayPeriod({ target: { type: 'maximum_value', maximum: 5, measurement: { type: 'count', unit: 'drinks' } } });
  const e = event({ eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 } }, period.id);
  const result = derivePeriodState(period, [e], period.reportingClosesAt);
  assert.equal(result.ok, false);
});

test('a malformed underlying event chain propagates as a failed period-state derivation', () => {
  const period = dayPeriod();
  const orphanCorrection = event(
    { eventType: 'correction', fact: { kind: 'build_completion', completions: 1 }, correctionOfEventId: 'missing' as CheckInId },
    period.id,
  );
  const result = derivePeriodState(period, [orphanCorrection], period.reportingClosesAt);
  assert.equal(result.ok, false);
});

// --- Stop: sticky-lapse semantics, distinct from the generic reduction above ---

const stopPeriod = (overrides: Partial<ChallengePeriod> = {}): ChallengePeriod => dayPeriod({
  periodKind: 'continuous',
  target: { type: 'maximum_lapses', maximum: 0 },
  ...overrides,
});

test('stop: intact, then a final intact attestation after tracking ends, is success', () => {
  const period = stopPeriod();
  const early = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime }, period.id);
  const final = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime }, period.id);
  const result = derivePeriodState(period, [early, final], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'satisfied', fact: { kind: 'stop_intact' } } });
});

test('stop: an early intact ping followed by silence through the deadline is closed_without_input, not success', () => {
  const period = stopPeriod();
  const early = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime }, period.id);
  const result = derivePeriodState(period, [early], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'closed_without_input' } });
});

test('stop: intact, then a lapse, then a later intact — the uncorrected lapse is absorbing', () => {
  const period = stopPeriod();
  const first = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-01T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T02:00:00Z' as IsoDateTime }, period.id);
  const lapse = event({ eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime }, period.id);
  const later = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime }, period.id);
  const result = derivePeriodState(period, [first, lapse, later], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'not_satisfied', fact: { kind: 'stop_lapse' } } });
});

test('stop: an accidental lapse corrected to intact, plus a later final intact attestation, is success', () => {
  const period = stopPeriod();
  const accidentalLapse = event({ eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime }, period.id);
  const correction = event({ eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: accidentalLapse.id, clientRecordedAt: '2026-03-01T07:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T07:00:00Z' as IsoDateTime }, period.id);
  const finalAttestation = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime }, period.id);
  const result = derivePeriodState(period, [accidentalLapse, correction, finalAttestation], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'satisfied', fact: { kind: 'stop_intact' } } });
});

// --- A correction must not masquerade as the final intact attestation ---
// The correction's own (necessarily later) timestamp must never be mistaken
// for an ordinary root stop_intact declaration's timestamp — only the root
// declaration's own trusted time counts toward the final-attestation window.

test('stop: an early lapse corrected to intact AFTER tracking ends, with no separate final attestation, is still closed_without_input — the correction is not itself a final attestation', () => {
  const period = stopPeriod();
  const earlyLapse = event({ eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime }, period.id);
  // The correction itself lands inside [endsAt, reportingClosesAt) — exactly the window a bug could mistake for a final attestation.
  const correctionAfterTrackingEnds = event({ eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: earlyLapse.id, clientRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime }, period.id);
  const result = derivePeriodState(period, [earlyLapse, correctionAfterTrackingEnds], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'closed_without_input' } });
});

test('stop: an early lapse corrected to intact, plus a SEPARATE ordinary final intact declaration, is success', () => {
  const period = stopPeriod();
  const earlyLapse = event({ eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime }, period.id);
  const correctionAfterTrackingEnds = event({ eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: earlyLapse.id, clientRecordedAt: '2026-03-02T01:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T01:00:00Z' as IsoDateTime }, period.id);
  const separateFinalAttestation = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime }, period.id);
  const result = derivePeriodState(period, [earlyLapse, correctionAfterTrackingEnds, separateFinalAttestation], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'satisfied', fact: { kind: 'stop_intact' } } });
});

test('stop: an ordinary final intact declaration later corrected to a lapse no longer qualifies — failure', () => {
  const period = stopPeriod();
  const finalIntact = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime }, period.id);
  const correctionToLapse = event({ eventType: 'correction', fact: { kind: 'stop_lapse' }, correctionOfEventId: finalIntact.id, clientRecordedAt: '2026-03-02T03:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T03:00:00Z' as IsoDateTime }, period.id);
  const result = derivePeriodState(period, [finalIntact, correctionToLapse], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'not_satisfied', fact: { kind: 'stop_lapse' } } });
});

test('stop: repeated ordinary intact attestations are valid history, not a malformed chain', () => {
  const period = stopPeriod();
  const first = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-01T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T02:00:00Z' as IsoDateTime }, period.id);
  const second = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-01T06:00:00Z' as IsoDateTime }, period.id);
  const final = event({ eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime, serverRecordedAt: '2026-03-02T02:00:00Z' as IsoDateTime }, period.id);
  const result = derivePeriodState(period, [first, second, final], period.reportingClosesAt);
  assert.deepEqual(result, { ok: true, state: { kind: 'satisfied', fact: { kind: 'stop_intact' } } });
});
