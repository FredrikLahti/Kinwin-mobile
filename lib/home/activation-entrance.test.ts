import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowActivationEntrance } from './activation-entrance';

test('shouldShowActivationEntrance: the literal "1" plays the entrance', () => {
  assert.equal(shouldShowActivationEntrance('1'), true);
});

test('shouldShowActivationEntrance: an absent param is an ordinary visit', () => {
  assert.equal(shouldShowActivationEntrance(undefined), false);
});

test('shouldShowActivationEntrance: any other value is an ordinary visit', () => {
  assert.equal(shouldShowActivationEntrance('0'), false);
  assert.equal(shouldShowActivationEntrance(''), false);
  assert.equal(shouldShowActivationEntrance('true'), false);
});
