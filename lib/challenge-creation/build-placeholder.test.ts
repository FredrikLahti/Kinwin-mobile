import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBuildBehaviorPlaceholder } from './build-placeholder';

test('matches each of goal.tsx\'s four example chips to a distinct, relevant placeholder', () => {
  assert.equal(resolveBuildBehaviorPlaceholder('Feel stronger'), 'Do a 20-minute strength workout');
  assert.equal(resolveBuildBehaviorPlaceholder('Sleep better'), 'Be in bed with the lights off by 11pm');
  assert.equal(resolveBuildBehaviorPlaceholder('Eat healthier'), 'Cook a vegetable-based dinner');
  assert.equal(resolveBuildBehaviorPlaceholder('Use my time better'), 'Work with your phone in another room for 25 minutes');
});

test('matches case-insensitively and against free-text variants, not just the exact example strings', () => {
  assert.equal(resolveBuildBehaviorPlaceholder('EAT HEALTHIER'), 'Cook a vegetable-based dinner');
  assert.equal(resolveBuildBehaviorPlaceholder('I want to eat better food'), 'Cook a vegetable-based dinner');
  assert.equal(resolveBuildBehaviorPlaceholder('get stronger this year'), 'Do a 20-minute strength workout');
  assert.equal(resolveBuildBehaviorPlaceholder('improve my sleep'), 'Be in bed with the lights off by 11pm');
});

test('falls back to the generic walking example for an unrelated or empty goal', () => {
  assert.equal(resolveBuildBehaviorPlaceholder(''), 'Walk for at least 20 minutes');
  assert.equal(resolveBuildBehaviorPlaceholder('   '), 'Walk for at least 20 minutes');
  assert.equal(resolveBuildBehaviorPlaceholder('Learn to paint'), 'Walk for at least 20 minutes');
});

test('matches read-related goals', () => {
  assert.equal(resolveBuildBehaviorPlaceholder('Read more books'), 'Read for 20 minutes');
});
