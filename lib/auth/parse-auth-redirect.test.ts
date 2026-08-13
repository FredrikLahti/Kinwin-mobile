import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAuthRedirectParams } from './parse-auth-redirect';

test('parses hash-fragment tokens (implicit-flow recovery link shape)', () => {
  const params = parseAuthRedirectParams('https://kinwin-beta.expo.app/auth/reset-password#access_token=abc&refresh_token=def&type=recovery');
  assert.equal(params.access_token, 'abc');
  assert.equal(params.refresh_token, 'def');
  assert.equal(params.type, 'recovery');
});

// The parser itself is generic (any key from a query string), but Kinwin's
// app never acts on a `code` param — the client is deliberately configured
// for the implicit flow (lib/supabase/client.ts), which never produces one
// for this app's recovery/confirmation links. This test only proves the
// parser doesn't special-case or drop an unrelated query key, not that the
// app supports PKCE code exchange.
test('parses an arbitrary query string generically, without any auth-specific assumptions', () => {
  const params = parseAuthRedirectParams('https://kinwin-beta.expo.app/auth/reset-password?foo=xyz&type=recovery');
  assert.equal(params.foo, 'xyz');
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
