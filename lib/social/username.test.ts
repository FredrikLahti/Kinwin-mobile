import assert from 'node:assert/strict';
import test from 'node:test';

import { checkUsername } from './username';

const TAKEN = ['alex_r', 'mia.rowan'];

test('an empty or whitespace-only input yields empty, without checking availability', () => {
  assert.equal(checkUsername('', TAKEN).kind, 'empty');
  assert.equal(checkUsername('   ', TAKEN).kind, 'empty');
});

test('a username starting with a digit is invalid format', () => {
  const outcome = checkUsername('1alex', TAKEN);
  assert.equal(outcome.kind, 'invalid_format');
});

test('a username with disallowed characters is invalid format', () => {
  const outcome = checkUsername('alex rivera!', TAKEN);
  assert.equal(outcome.kind, 'invalid_format');
});

test('a username shorter than 3 characters is invalid format', () => {
  const outcome = checkUsername('al', TAKEN);
  assert.equal(outcome.kind, 'invalid_format');
});

test('a valid, untaken username is available', () => {
  const outcome = checkUsername('sam_k', TAKEN);
  assert.equal(outcome.kind, 'available');
  assert.equal(outcome.kind === 'available' && outcome.username, 'sam_k');
});

test('a valid, taken username is unavailable, case-insensitively', () => {
  const outcome = checkUsername('ALEX_R', TAKEN);
  assert.equal(outcome.kind, 'unavailable');
  assert.equal(outcome.kind === 'unavailable' && outcome.username, 'alex_r');
});
