import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAuthRedirectParams } from './parse-auth-redirect';

test('parses hash-fragment tokens (implicit-flow recovery link shape)', () => {
  const params = parseAuthRedirectParams('https://kinwin-beta.expo.app/auth/reset-password#access_token=abc&refresh_token=def&type=recovery');
  assert.equal(params.access_token, 'abc');
  assert.equal(params.refresh_token, 'def');
  assert.equal(params.type, 'recovery');
});

test('parses query-string tokens (PKCE code exchange shape)', () => {
  const params = parseAuthRedirectParams('https://kinwin-beta.expo.app/auth/reset-password?code=xyz&type=recovery');
  assert.equal(params.code, 'xyz');
  assert.equal(params.type, 'recovery');
});

test('returns an empty object for a URL with neither a hash nor a query', () => {
  assert.deepEqual(parseAuthRedirectParams('https://kinwin-beta.expo.app/auth/reset-password'), {});
});

test('prefers the hash fragment when both a query and a hash are present', () => {
  const params = parseAuthRedirectParams('https://kinwin-beta.expo.app/auth/reset-password?foo=1#access_token=abc');
  assert.equal(params.access_token, 'abc');
  assert.equal(params.foo, undefined);
});
