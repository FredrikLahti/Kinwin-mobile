import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPasswordResetRedirectUrl } from './reset-password-url';

test('builds a real reset URL from a valid https base', () => {
  assert.equal(buildPasswordResetRedirectUrl('https://kinwin-beta.expo.app'), 'https://kinwin-beta.expo.app/auth/reset-password');
  assert.equal(buildPasswordResetRedirectUrl('https://kinwin-beta.expo.app/'), 'https://kinwin-beta.expo.app/auth/reset-password');
});

test('rejects a missing, empty, or non-https base rather than guessing', () => {
  assert.equal(buildPasswordResetRedirectUrl(undefined), null);
  assert.equal(buildPasswordResetRedirectUrl(''), null);
  assert.equal(buildPasswordResetRedirectUrl('http://kinwin-beta.expo.app'), null);
  assert.equal(buildPasswordResetRedirectUrl('kinwin://reset'), null);
});
