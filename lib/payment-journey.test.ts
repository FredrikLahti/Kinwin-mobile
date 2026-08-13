import assert from 'node:assert/strict';
import test from 'node:test';
import { describeOwnerPaymentStatus } from './payment-journey';

test('only needs_attention produces owner-facing copy — everything else stays silent', () => {
  assert.equal(describeOwnerPaymentStatus({ state: 'not_applicable' }), null);
  assert.equal(describeOwnerPaymentStatus({ state: 'processing' }), null);
  assert.equal(describeOwnerPaymentStatus({ state: 'paid' }), null);
  const presentation = describeOwnerPaymentStatus({ state: 'needs_attention' });
  assert.ok(presentation);
  assert.match(presentation.label, /needs attention/i);
  assert.equal(presentation.tone, 'attention');
});

test('needs_attention copy never leaks provider or internal detail', () => {
  const presentation = describeOwnerPaymentStatus({ state: 'needs_attention' });
  const serialized = JSON.stringify(presentation).toLowerCase();
  for (const forbidden of ['stripe', 'payment_intent', 'setup_intent', 'permanently_failed', 'requires_payment_method', 'requires_action']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
