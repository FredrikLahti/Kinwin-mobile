import assert from 'node:assert/strict';
import test from 'node:test';

import { cutBackContinuityCheck } from './cut-back-continuity';
import { EffectivePeriodState } from './period-state';

const satisfied: EffectivePeriodState = { kind: 'satisfied', fact: { kind: 'cut_back_total', total: 1, unit: 'drinks' } };
const notSatisfied: EffectivePeriodState = { kind: 'not_satisfied', fact: { kind: 'cut_back_total', total: 9, unit: 'drinks' } };
const noResponse: EffectivePeriodState = { kind: 'closed_without_input' };

test('within the locked run limit is flagged as within continuity', () => {
  const states = [satisfied, notSatisfied, notSatisfied, satisfied, satisfied];
  const result = cutBackContinuityCheck(states, { type: 'maximum_consecutive_exceeded_days', maximum: 2 });
  assert.equal(result.withinContinuity, true);
  assert.equal(result.longestConsecutiveExceededRun, 2);
});

test('exceeding the locked run limit is flagged as outside continuity', () => {
  const states = [satisfied, notSatisfied, notSatisfied, notSatisfied, satisfied];
  const result = cutBackContinuityCheck(states, { type: 'maximum_consecutive_exceeded_days', maximum: 2 });
  assert.equal(result.withinContinuity, false);
  assert.equal(result.longestConsecutiveExceededRun, 3);
});

test('a consecutive run of no-response periods counts toward the exceeded run', () => {
  const states = [satisfied, noResponse, noResponse, noResponse];
  const result = cutBackContinuityCheck(states, { type: 'maximum_consecutive_exceeded_weeks', maximum: 1 });
  assert.equal(result.withinContinuity, false);
  assert.equal(result.longestConsecutiveExceededRun, 3);
});

test('an isolated exceeded period does not accumulate across a satisfied gap', () => {
  const states = [notSatisfied, satisfied, notSatisfied, satisfied];
  const result = cutBackContinuityCheck(states, { type: 'maximum_consecutive_exceeded_days', maximum: 1 });
  assert.equal(result.withinContinuity, true);
  assert.equal(result.longestConsecutiveExceededRun, 1);
});
