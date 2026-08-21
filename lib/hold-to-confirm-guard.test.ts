import assert from 'node:assert/strict';
import test from 'node:test';

import { canBeginOrCompleteHold, shouldClearFiredGuard, shouldShowReducedMotionHoldFeedback } from './hold-to-confirm-guard';

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

test('shouldShowReducedMotionHoldFeedback shows while genuinely holding under Reduce Motion', () => {
  assert.equal(shouldShowReducedMotionHoldFeedback({ disabled: false, holding: true, reducedMotion: true }), true);
});

test('shouldShowReducedMotionHoldFeedback stays hidden when not holding', () => {
  assert.equal(shouldShowReducedMotionHoldFeedback({ disabled: false, holding: false, reducedMotion: true }), false);
});

test('shouldShowReducedMotionHoldFeedback stays hidden when Reduce Motion is off (the animated fill is the feedback instead)', () => {
  assert.equal(shouldShowReducedMotionHoldFeedback({ disabled: false, holding: true, reducedMotion: false }), false);
});

test('shouldShowReducedMotionHoldFeedback stays hidden once activation is in flight, even if still marked holding', () => {
  assert.equal(shouldShowReducedMotionHoldFeedback({ disabled: true, holding: true, reducedMotion: true }), false);
});
