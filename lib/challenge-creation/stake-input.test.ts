import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeStakeDigits } from './stake-input';

test('normalizeStakeDigits strips non-digit characters', () => {
  assert.equal(normalizeStakeDigits('7a5', 7), '75');
});

test('normalizeStakeDigits strips leading zeros once a real digit follows', () => {
  assert.equal(normalizeStakeDigits('075', 7), '75');
  assert.equal(normalizeStakeDigits('007', 7), '7');
});

test('normalizeStakeDigits keeps a single bare "0" as typed, so it does not just vanish', () => {
  assert.equal(normalizeStakeDigits('0', 7), '0');
});

test('normalizeStakeDigits truncates to maxLength after stripping leading zeros', () => {
  assert.equal(normalizeStakeDigits('012345678', 7), '1234567');
});

test('normalizeStakeDigits returns empty string for empty input', () => {
  assert.equal(normalizeStakeDigits('', 7), '');
});
