import assert from 'node:assert/strict';
import test from 'node:test';

import { createResultEntranceTracker } from './result-entrance';

test('an unseen challenge id reports hasSeen false', () => {
  const tracker = createResultEntranceTracker();
  assert.equal(tracker.hasSeen('challenge-1'), false);
});

test('hasSeen is a pure read: calling it repeatedly never marks the id seen', () => {
  const tracker = createResultEntranceTracker();
  tracker.hasSeen('challenge-1');
  tracker.hasSeen('challenge-1');
  tracker.hasSeen('challenge-1');
  assert.equal(tracker.hasSeen('challenge-1'), false);
});

test('markSeen makes a subsequent hasSeen report true', () => {
  const tracker = createResultEntranceTracker();
  tracker.markSeen('challenge-1');
  assert.equal(tracker.hasSeen('challenge-1'), true);
});

test('marking one challenge seen does not affect another', () => {
  const tracker = createResultEntranceTracker();
  tracker.markSeen('challenge-1');
  assert.equal(tracker.hasSeen('challenge-2'), false);
});

test('markSeen is idempotent: calling it more than once for the same id is harmless', () => {
  const tracker = createResultEntranceTracker();
  tracker.markSeen('challenge-1');
  tracker.markSeen('challenge-1');
  tracker.markSeen('challenge-1');
  assert.equal(tracker.hasSeen('challenge-1'), true);
});

test('separate trackers do not share state', () => {
  const a = createResultEntranceTracker();
  const b = createResultEntranceTracker();
  a.markSeen('challenge-1');
  assert.equal(b.hasSeen('challenge-1'), false);
});
