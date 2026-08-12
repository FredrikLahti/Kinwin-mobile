import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDraftSaveError } from './classify-draft-save-error';

test('the archived-immutable-row trigger message classifies as a structured archived result, not raw text', () => {
  const result = classifyDraftSaveError('new row violates row-level security policy for table "challenge_drafts": archived challenge_drafts rows are immutable');
  assert.deepEqual(result, { kind: 'archived' });
});

test('a network/fetch failure classifies as network with a safe message', () => {
  assert.deepEqual(classifyDraftSaveError('Network request failed'), {
    kind: 'network',
    message: 'Could not reach Kinwin. Check your connection and try again.',
  });
  assert.deepEqual(classifyDraftSaveError('fetch failed'), {
    kind: 'network',
    message: 'Could not reach Kinwin. Check your connection and try again.',
  });
});

test('an unrecognized database error classifies as unknown and never repeats its raw text', () => {
  const raw = 'duplicate key value violates unique constraint "challenge_drafts_pkey"';
  const result = classifyDraftSaveError(raw);
  assert.deepEqual(result, { kind: 'unknown', message: 'Something went wrong. Try again.' });
});
