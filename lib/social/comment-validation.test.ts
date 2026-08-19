import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMENT_MAX_LENGTH, validateCommentBody } from './comment-validation';

test('trims surrounding whitespace before checking anything else', () => {
  const result = validateCommentBody('  Book the restaurant, you idiot.  ');
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.trimmed, 'Book the restaurant, you idiot.');
});

test('rejects an empty or whitespace-only comment', () => {
  assert.deepEqual(validateCommentBody(''), { ok: false, kind: 'empty' });
  assert.deepEqual(validateCommentBody('   '), { ok: false, kind: 'empty' });
});

test('accepts exactly 200 trimmed characters, rejects 201', () => {
  const atLimit = 'a'.repeat(COMMENT_MAX_LENGTH);
  const overLimit = 'a'.repeat(COMMENT_MAX_LENGTH + 1);
  assert.equal(validateCommentBody(atLimit).ok, true);
  assert.deepEqual(validateCommentBody(overLimit), { ok: false, kind: 'too_long' });
});
