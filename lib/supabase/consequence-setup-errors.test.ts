import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyCreateSetupIntentOutcome } from './consequence-setup-errors';

test('a fetch or relay transport failure is always network, regardless of any body', () => {
  assert.equal(classifyCreateSetupIntentOutcome({ transport: 'fetch_error', status: null, body: null }).kind, 'network');
  assert.equal(classifyCreateSetupIntentOutcome({ transport: 'relay_error', status: null, body: { error: 'not_found' } }).kind, 'network');
});

test('each documented Edge Function error code maps to its own distinct state', () => {
  const cases: Array<[string, ReturnType<typeof classifyCreateSetupIntentOutcome>['kind']]> = [
    ['not_found', 'not_found'],
    ['invalid_state', 'invalid_state'],
    ['unauthorized', 'not_authenticated'],
    ['server_configuration_error', 'server_configuration_error'],
    ['payment_provider_error', 'provider_error'],
  ];
  for (const [error, expectedKind] of cases) {
    assert.equal(classifyCreateSetupIntentOutcome({ transport: 'http_error', status: 400, body: { error } }).kind, expectedKind, `expected ${error} to map to ${expectedKind}`);
  }
});

test('an unrecognized or missing error code, or a body that failed to parse, falls back to unknown rather than mislabeling the failure', () => {
  assert.equal(classifyCreateSetupIntentOutcome({ transport: 'http_error', status: 400, body: { error: 'invalid_request' } }).kind, 'unknown');
  assert.equal(classifyCreateSetupIntentOutcome({ transport: 'http_error', status: 500, body: null }).kind, 'unknown');
});
