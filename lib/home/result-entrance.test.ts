import assert from 'node:assert/strict';
import test from 'node:test';

import { createResultEntranceTracker } from './result-entrance';

test('shouldPlay is true the first time a challenge id is seen', () => {
  const tracker = createResultEntranceTracker();
  assert.equal(tracker.shouldPlay('challenge-1'), true);
});

test('shouldPlay is false on every later call for the same challenge id', () => {
  const tracker = createResultEntranceTracker();
  assert.equal(tracker.shouldPlay('challenge-1'), true);
  assert.equal(tracker.shouldPlay('challenge-1'), false);
  assert.equal(tracker.shouldPlay('challenge-1'), false);
});

test('shouldPlay tracks each challenge id independently', () => {
  const tracker = createResultEntranceTracker();
  assert.equal(tracker.shouldPlay('challenge-1'), true);
  assert.equal(tracker.shouldPlay('challenge-2'), true);
  assert.equal(tracker.shouldPlay('challenge-1'), false);
});

test('separate trackers do not share state', () => {
  const a = createResultEntranceTracker();
  const b = createResultEntranceTracker();
  assert.equal(a.shouldPlay('challenge-1'), true);
  assert.equal(b.shouldPlay('challenge-1'), true);
});
