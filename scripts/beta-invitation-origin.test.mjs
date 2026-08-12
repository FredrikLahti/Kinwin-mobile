import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInvitationOrigin } from './beta-invitation-origin.cjs';

test('accepts a bare https origin', () => {
  assert.deepEqual(parseInvitationOrigin('https://beta.kinwin.example'), { host: 'beta.kinwin.example', hostname: 'beta.kinwin.example' });
});

test('rejects non-https, ports, paths, queries, fragments, and credentials', () => {
  assert.throws(() => parseInvitationOrigin('http://beta.kinwin.example'));
  assert.throws(() => parseInvitationOrigin('https://beta.kinwin.example:8443'));
  assert.throws(() => parseInvitationOrigin('https://beta.kinwin.example/invite/abc'));
  assert.throws(() => parseInvitationOrigin('https://beta.kinwin.example?x=1'));
  assert.throws(() => parseInvitationOrigin('https://beta.kinwin.example#frag'));
  assert.throws(() => parseInvitationOrigin('https://user:pass@beta.kinwin.example'));
});

test('rejects localhost and IP literals', () => {
  assert.throws(() => parseInvitationOrigin('https://localhost'));
  assert.throws(() => parseInvitationOrigin('https://sub.localhost'));
  assert.throws(() => parseInvitationOrigin('https://127.0.0.1'));
  assert.throws(() => parseInvitationOrigin('https://192.168.1.5'));
  assert.throws(() => parseInvitationOrigin('https://[::1]'));
});

test('rejects missing or malformed input', () => {
  assert.throws(() => parseInvitationOrigin(undefined));
  assert.throws(() => parseInvitationOrigin(''));
  assert.throws(() => parseInvitationOrigin('not a url'));
});
