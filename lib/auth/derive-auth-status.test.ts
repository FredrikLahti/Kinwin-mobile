import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveAuthStatus } from './derive-auth-status';

test('PASSWORD_RECOVERY is never conflated with an ordinary sign-in, even with a real session', () => {
  assert.equal(deriveAuthStatus('PASSWORD_RECOVERY', true), 'password_recovery');
});

test('every other event with a session is an ordinary signed-in state', () => {
  assert.equal(deriveAuthStatus('SIGNED_IN', true), 'signed_in');
  assert.equal(deriveAuthStatus('TOKEN_REFRESHED', true), 'signed_in');
  // USER_UPDATED is what fires after a recovery session successfully calls
  // updateUser({password}) — this is the exact transition that completes
  // the handoff from recovery back into a normal session.
  assert.equal(deriveAuthStatus('USER_UPDATED', true), 'signed_in');
});

test('no session on an ordinary event is signed_out', () => {
  assert.equal(deriveAuthStatus('SIGNED_OUT', false), 'signed_out');
});
