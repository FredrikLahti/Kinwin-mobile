import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChallengeResultHapticOutcome, resolveCheckInHapticOutcome } from './haptics-outcome';

test('resolveCheckInHapticOutcome: build_completion is Important', () => {
  assert.equal(resolveCheckInHapticOutcome('build_completion'), 'important');
});

test('resolveCheckInHapticOutcome: cut_back_total is Important', () => {
  assert.equal(resolveCheckInHapticOutcome('cut_back_total'), 'important');
});

test('resolveCheckInHapticOutcome: stop_intact is Important', () => {
  assert.equal(resolveCheckInHapticOutcome('stop_intact'), 'important');
});

test('resolveCheckInHapticOutcome: stop_lapse is Consequence, never Important', () => {
  assert.equal(resolveCheckInHapticOutcome('stop_lapse'), 'consequence');
});

test('resolveChallengeResultHapticOutcome: completed_success is Success', () => {
  assert.equal(resolveChallengeResultHapticOutcome('completed_success'), 'success');
});

test('resolveChallengeResultHapticOutcome: completed_failure is Consequence, never an error-style outcome', () => {
  assert.equal(resolveChallengeResultHapticOutcome('completed_failure'), 'consequence');
});
