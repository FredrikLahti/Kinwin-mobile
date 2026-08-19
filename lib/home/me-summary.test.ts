import assert from 'node:assert/strict';
import test from 'node:test';

import { describeChallengeHistory } from './me-summary';

test('no history at all renders nothing (sparse is acceptable)', () => {
  assert.equal(describeChallengeHistory({ completed: 0, failed: 0 }), null);
});

test('completed already includes failed — an all-success history never appends a redundant failed count', () => {
  assert.equal(describeChallengeHistory({ completed: 7, failed: 0 }), '7 challenges completed.');
});

test('a single success uses singular phrasing', () => {
  assert.equal(describeChallengeHistory({ completed: 1, failed: 0 }), '1 challenge completed.');
});

test('mixed history reports the real, non-overlapping breakdown: succeeded = completed - failed', () => {
  // completed=7 total resolved, failed=2 of those — 5 actually succeeded.
  // The old copy ("7 completed, 2 that taught you something") implied 9.
  assert.equal(describeChallengeHistory({ completed: 7, failed: 2 }), '5 succeeded · 2 failed.');
});

test('every resolved challenge failed — stated plainly, no euphemism', () => {
  assert.equal(describeChallengeHistory({ completed: 2, failed: 2 }), '2 challenges failed.');
});

test('a single failure uses singular phrasing', () => {
  assert.equal(describeChallengeHistory({ completed: 1, failed: 1 }), '1 challenge failed.');
});
