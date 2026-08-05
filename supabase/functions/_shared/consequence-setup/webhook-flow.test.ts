import assert from 'node:assert/strict';
import test from 'node:test';

import { StripeSetupIntent } from './types.ts';
import { isHandledSetupIntentEventType, planWebhookApplication } from './webhook-flow.ts';

function setupIntent(overrides: Partial<StripeSetupIntent> = {}): StripeSetupIntent {
  return {
    id: 'seti_1',
    clientSecret: 'seti_1_secret',
    status: 'succeeded',
    customerId: 'cus_1',
    paymentMethodId: 'pm_1',
    ...overrides,
  };
}

test('planWebhookApplication: setup_intent.succeeded maps to a succeeded application', () => {
  const plan = planWebhookApplication({ id: 'evt_1', type: 'setup_intent.succeeded' }, setupIntent());
  assert.deepEqual(plan, {
    stripeEventId: 'evt_1',
    eventType: 'setup_intent.succeeded',
    stripeSetupIntentId: 'seti_1',
    stripeCustomerId: 'cus_1',
    stripePaymentMethodId: 'pm_1',
    status: 'succeeded',
  });
});

test('planWebhookApplication: setup_intent.setup_failed maps to a failed application', () => {
  const plan = planWebhookApplication({ id: 'evt_2', type: 'setup_intent.setup_failed' }, setupIntent({ paymentMethodId: null }));
  assert.equal(plan?.status, 'failed');
  assert.equal(plan?.stripePaymentMethodId, null);
});

test('planWebhookApplication: setup_intent.canceled maps to a canceled application', () => {
  const plan = planWebhookApplication({ id: 'evt_3', type: 'setup_intent.canceled' }, setupIntent());
  assert.equal(plan?.status, 'canceled');
});

test('planWebhookApplication: an unrelated event type is ignored (null)', () => {
  const plan = planWebhookApplication({ id: 'evt_4', type: 'payment_intent.succeeded' }, setupIntent());
  assert.equal(plan, null);
});

test('planWebhookApplication: uses the retrieved SetupIntent object, not just the raw event id', () => {
  const plan = planWebhookApplication(
    { id: 'evt_5', type: 'setup_intent.succeeded' },
    setupIntent({ id: 'seti_retrieved', customerId: 'cus_retrieved', paymentMethodId: 'pm_retrieved' }),
  );
  assert.equal(plan?.stripeSetupIntentId, 'seti_retrieved');
  assert.equal(plan?.stripeCustomerId, 'cus_retrieved');
  assert.equal(plan?.stripePaymentMethodId, 'pm_retrieved');
});

// Regression: the webhook entrypoint must check this *before* ever calling
// Stripe to retrieve anything — an unrelated event's object id (e.g. a
// PaymentIntent id on a payment_intent.succeeded event) is not a
// SetupIntent id, so attempting retrieval for it is never correct. A real
// end-to-end run first caught this as a wrongly-502ing response instead of
// the expected 200 no-op.
test('isHandledSetupIntentEventType: true only for the three SetupIntent event types this system acts on', () => {
  assert.equal(isHandledSetupIntentEventType('setup_intent.succeeded'), true);
  assert.equal(isHandledSetupIntentEventType('setup_intent.setup_failed'), true);
  assert.equal(isHandledSetupIntentEventType('setup_intent.canceled'), true);
  assert.equal(isHandledSetupIntentEventType('payment_intent.succeeded'), false);
  assert.equal(isHandledSetupIntentEventType('customer.created'), false);
});
