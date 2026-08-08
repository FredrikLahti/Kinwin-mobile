import assert from 'node:assert/strict';
import test from 'node:test';

import { derivePaymentSetupAvailability } from './payment-setup-availability';

test('web is always native_required, even with a configured key', () => {
  assert.deepEqual(derivePaymentSetupAvailability({ isWeb: true, stripeConfigured: true }), { kind: 'unavailable', reason: 'native_required' });
  assert.deepEqual(derivePaymentSetupAvailability({ isWeb: true, stripeConfigured: false }), { kind: 'unavailable', reason: 'native_required' });
});

test('a native platform without a publishable key fails safely as not_configured', () => {
  assert.deepEqual(derivePaymentSetupAvailability({ isWeb: false, stripeConfigured: false }), { kind: 'unavailable', reason: 'not_configured' });
});

test('a native platform with a configured key is available', () => {
  assert.deepEqual(derivePaymentSetupAvailability({ isWeb: false, stripeConfigured: true }), { kind: 'available' });
});
