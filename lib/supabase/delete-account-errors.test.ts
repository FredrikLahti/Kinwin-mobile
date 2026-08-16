import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDeleteAccountOutcome } from './delete-account-errors';

test('classifyDeleteAccountOutcome: a fetch/relay transport failure maps to a network error', () => {
  assert.deepEqual(
    classifyDeleteAccountOutcome({ transport: 'fetch_error', status: null, body: null }),
    { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' },
  );
  assert.deepEqual(
    classifyDeleteAccountOutcome({ transport: 'relay_error', status: null, body: null }),
    { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' },
  );
});

test('classifyDeleteAccountOutcome: unauthorized', () => {
  const result = classifyDeleteAccountOutcome({ transport: 'http_error', status: 401, body: { error: 'unauthorized' } });
  assert.deepEqual(result, { kind: 'not_authenticated', message: 'Sign in again to delete your account.' });
});

test('classifyDeleteAccountOutcome: ineligible carries the blocker reason token through untouched, for the caller to map to real copy', () => {
  const result = classifyDeleteAccountOutcome({
    transport: 'http_error',
    status: 409,
    body: { error: 'ineligible', message: 'active_challenge' },
  });
  assert.deepEqual(result, { kind: 'ineligible', reason: 'active_challenge' });
});

test('classifyDeleteAccountOutcome: ineligible without a message still returns a safe reason token', () => {
  const result = classifyDeleteAccountOutcome({ transport: 'http_error', status: 409, body: { error: 'ineligible' } });
  assert.deepEqual(result, { kind: 'ineligible', reason: 'unknown' });
});

test('classifyDeleteAccountOutcome: account_removal_incomplete passes the server\'s own safe message through', () => {
  const result = classifyDeleteAccountOutcome({
    transport: 'http_error',
    status: 502,
    body: { error: 'account_removal_incomplete', message: 'Your data was removed, but finishing account removal failed. Please try again or contact support.' },
  });
  assert.deepEqual(result, {
    kind: 'incomplete',
    message: 'Your data was removed, but finishing account removal failed. Please try again or contact support.',
  });
});

test('classifyDeleteAccountOutcome: an unrecognized error falls through to a generic retry message', () => {
  const result = classifyDeleteAccountOutcome({ transport: 'http_error', status: 500, body: { error: 'internal_error' } });
  assert.deepEqual(result, { kind: 'unknown', message: 'Something went wrong deleting your account. Try again.' });
});
