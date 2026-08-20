import assert from 'node:assert/strict';
import test from 'node:test';

import { canBeginOrCompleteHold, shouldClearFiredGuard } from './hold-to-confirm-guard';

test('canBeginOrCompleteHold allows a fresh, enabled hold to begin', () => {
  assert.equal(canBeginOrCompleteHold({ alreadyFired: false, disabled: false }), true);
});

test('canBeginOrCompleteHold blocks a second completion of the same hold cycle', () => {
  assert.equal(canBeginOrCompleteHold({ alreadyFired: true, disabled: false }), false);
});

test('canBeginOrCompleteHold blocks starting or completing while disabled (activation already in flight)', () => {
  assert.equal(canBeginOrCompleteHold({ alreadyFired: false, disabled: true }), false);
});

test('canBeginOrCompleteHold blocks when both already fired and disabled', () => {
  assert.equal(canBeginOrCompleteHold({ alreadyFired: true, disabled: true }), false);
});

test('shouldClearFiredGuard clears only on the disabled -> enabled transition', () => {
  assert.equal(shouldClearFiredGuard(true, false), true);
});

test('shouldClearFiredGuard does not clear while still disabled', () => {
  assert.equal(shouldClearFiredGuard(true, true), false);
});

test('shouldClearFiredGuard does not clear on enabled -> enabled (no transition)', () => {
  assert.equal(shouldClearFiredGuard(false, false), false);
});

test('shouldClearFiredGuard does not clear on enabled -> disabled', () => {
  assert.equal(shouldClearFiredGuard(false, true), false);
});
