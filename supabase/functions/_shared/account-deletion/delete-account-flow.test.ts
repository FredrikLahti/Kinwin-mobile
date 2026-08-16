import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDeletionRpcError, isUserAlreadyRemoved } from './delete-account-flow.ts';

test('classifyDeletionRpcError: 22023 (ineligible) passes the blocker reason token through as the message', () => {
  const response = classifyDeletionRpcError({ code: '22023', message: 'active_challenge' });
  assert.deepEqual(response, { status: 409, body: { error: 'ineligible', message: 'active_challenge' } });
});

test('classifyDeletionRpcError: 28000 maps to unauthorized', () => {
  const response = classifyDeletionRpcError({ code: '28000' });
  assert.deepEqual(response, { status: 401, body: { error: 'unauthorized' } });
});

test('classifyDeletionRpcError: an unrecognized code never leaks the raw Postgres error', () => {
  const response = classifyDeletionRpcError({ code: '42P01', message: 'relation "x" does not exist' });
  assert.deepEqual(response, { status: 500, body: { error: 'internal_error' } });
});

test('classifyDeletionRpcError: a missing code also falls through to internal_error', () => {
  const response = classifyDeletionRpcError({});
  assert.deepEqual(response, { status: 500, body: { error: 'internal_error' } });
});

test('isUserAlreadyRemoved: a 404 status is treated as already removed', () => {
  assert.equal(isUserAlreadyRemoved({ status: 404, message: 'User not found' }), true);
});

test('isUserAlreadyRemoved: a message mentioning "not found" is treated as already removed even without a 404 status', () => {
  assert.equal(isUserAlreadyRemoved({ message: 'User not found' }), true);
  assert.equal(isUserAlreadyRemoved({ message: 'user notfound' }), true);
});

test('isUserAlreadyRemoved: a genuine failure is never swallowed as already-removed', () => {
  assert.equal(isUserAlreadyRemoved({ status: 500, message: 'internal server error' }), false);
  assert.equal(isUserAlreadyRemoved({ status: 403, message: 'insufficient permissions' }), false);
  assert.equal(isUserAlreadyRemoved({}), false);
});
