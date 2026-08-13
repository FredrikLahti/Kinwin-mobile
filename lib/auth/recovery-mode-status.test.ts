import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStatusDuringRecovery } from './recovery-mode-status';

test('the actual event manual setSession() emits (SIGNED_IN) stays in recovery, not promoted to signed_in', () => {
  const result = deriveStatusDuringRecovery('SIGNED_IN', true);
  assert.equal(result.status, 'password_recovery');
  assert.equal(result.exitRecoveryMode, false);
});

test('a token refresh during recovery does not escape recovery mode either', () => {
  const result = deriveStatusDuringRecovery('TOKEN_REFRESHED', true);
  assert.equal(result.status, 'password_recovery');
  assert.equal(result.exitRecoveryMode, false);
});

test('USER_UPDATED (a successful password change) is the only thing that completes recovery', () => {
  const result = deriveStatusDuringRecovery('USER_UPDATED', true);
  assert.equal(result.status, 'signed_in');
  assert.equal(result.exitRecoveryMode, true);
});

test('losing the session entirely during recovery exits recovery mode rather than getting stuck', () => {
  const result = deriveStatusDuringRecovery('SIGNED_OUT', false);
  assert.equal(result.status, 'signed_out');
  assert.equal(result.exitRecoveryMode, true);
});

test('a real Supabase PASSWORD_RECOVERY event, if it ever occurred, also stays in recovery', () => {
  const result = deriveStatusDuringRecovery('PASSWORD_RECOVERY', true);
  assert.equal(result.status, 'password_recovery');
  assert.equal(result.exitRecoveryMode, false);
});
