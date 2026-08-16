import assert from 'node:assert/strict';
import test from 'node:test';

import { describeCorrectionFailure } from './check-in-correction';

test('a closed reporting window is not retryable and never mentions a database identifier', () => {
  const copy = describeCorrectionFailure({ ok: false, kind: 'rejected', reason: 'reporting_deadline_passed' });
  assert.equal(copy.retryable, false);
  assert.match(copy.message, /closed/i);
  assert.doesNotMatch(copy.message, /reporting_deadline_passed/);
});

test('a stale correction target is not retryable, since retrying the same request cannot succeed', () => {
  const copy = describeCorrectionFailure({ ok: false, kind: 'rejected', reason: 'correction_target_mismatch' });
  assert.equal(copy.retryable, false);
});

test('a genuine operation id conflict is retryable', () => {
  const copy = describeCorrectionFailure({ ok: false, kind: 'rejected', reason: 'operation_id_conflict' });
  assert.equal(copy.retryable, true);
});

test('an unrecognized rejection reason falls back to plain copy, never the raw reason string', () => {
  const copy = describeCorrectionFailure({ ok: false, kind: 'rejected', reason: 'some_future_reason_this_client_does_not_know' });
  assert.equal(copy.retryable, false);
  assert.doesNotMatch(copy.message, /some_future_reason/);
});

test('a challenge that is no longer active is described in terms of the challenge, not this one check-in, and is not retryable', () => {
  const copy = describeCorrectionFailure({ ok: false, kind: 'invalid_state', message: 'This challenge is no longer active.' });
  assert.equal(copy.retryable, false);
  assert.match(copy.message, /no longer active/);
});

test('network and unknown failures are retryable and reuse the repository\'s own plain message', () => {
  const network = describeCorrectionFailure({ ok: false, kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' });
  assert.equal(network.retryable, true);
  assert.equal(network.message, 'Could not reach Kinwin. Check your connection and try again.');

  const unknown = describeCorrectionFailure({ ok: false, kind: 'unknown', message: 'Something went wrong. Try again.' });
  assert.equal(unknown.retryable, true);
});

test('not_configured is not retryable', () => {
  const copy = describeCorrectionFailure({ ok: false, kind: 'not_configured' });
  assert.equal(copy.retryable, false);
});
