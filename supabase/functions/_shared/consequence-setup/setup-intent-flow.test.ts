import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeStripeAdapter } from './fake-stripe-adapter.ts';
import { runCreateSetupIntent } from './setup-intent-flow.ts';
import { SetupPreparation, StripeAdapter } from './types.ts';

function freshPreparation(overrides: Partial<SetupPreparation> = {}): SetupPreparation {
  return {
    challengeId: 'challenge-1',
    consequenceId: 'consequence-1',
    existingStripeCustomerId: null,
    reusableSetupAttemptId: null,
    reusableStripeSetupIntentId: null,
    ...overrides,
  };
}

test('runCreateSetupIntent: fresh setup creates a Customer and a SetupIntent', async () => {
  const adapter = new FakeStripeAdapter();
  const result = await runCreateSetupIntent({
    preparation: freshPreparation(),
    ownerId: 'owner-1',
    newAttemptNonce: 'nonce-1',
    adapter,
  });

  assert.equal(result.reused, false);
  assert.equal(result.consequenceId, 'consequence-1');
  assert.ok(result.stripeCustomerId.startsWith('cus_fake_'));
  assert.ok(result.stripeSetupIntentId.startsWith('seti_fake_'));
  assert.ok(result.clientSecret.length > 0);
});

test('runCreateSetupIntent: reuses an already-known Stripe Customer instead of creating a new one', async () => {
  const adapter = new FakeStripeAdapter();
  const result = await runCreateSetupIntent({
    preparation: freshPreparation({ existingStripeCustomerId: 'cus_existing' }),
    ownerId: 'owner-1',
    newAttemptNonce: 'nonce-1',
    adapter,
  });

  assert.equal(result.stripeCustomerId, 'cus_existing');
});

test('runCreateSetupIntent: a still-pending setup attempt is retrieved, never re-created', async () => {
  const adapter = new FakeStripeAdapter();
  // Simulate a prior creation that already happened.
  const original = await adapter.createSetupIntent({
    customerId: 'cus_existing',
    idempotencyKey: 'prior-key',
    metadata: {},
    paymentMethodTypes: ['card'],
    usage: 'off_session',
  });

  const result = await runCreateSetupIntent({
    preparation: freshPreparation({
      existingStripeCustomerId: 'cus_existing',
      reusableSetupAttemptId: 'attempt-1',
      reusableStripeSetupIntentId: original.id,
    }),
    ownerId: 'owner-1',
    newAttemptNonce: 'nonce-should-be-unused',
    adapter,
  });

  assert.equal(result.reused, true);
  assert.equal(result.stripeSetupIntentId, original.id);
  assert.equal(result.clientSecret, original.clientSecret);
});

test('runCreateSetupIntent: concurrent-style repeated calls for the same owner with no existing customer converge on one Customer (Stripe idempotency key)', async () => {
  const adapter = new FakeStripeAdapter();
  const first = await runCreateSetupIntent({
    preparation: freshPreparation({ consequenceId: 'consequence-a' }),
    ownerId: 'owner-shared',
    newAttemptNonce: 'nonce-a',
    adapter,
  });
  const second = await runCreateSetupIntent({
    preparation: freshPreparation({ consequenceId: 'consequence-b' }),
    ownerId: 'owner-shared',
    newAttemptNonce: 'nonce-b',
    adapter,
  });

  assert.equal(first.stripeCustomerId, second.stripeCustomerId, 'both calls for the same owner must resolve to the same Stripe Customer');
  // Different consequences still get their own SetupIntent.
  assert.notEqual(first.stripeSetupIntentId, second.stripeSetupIntentId);
});

test('runCreateSetupIntent: repeating the exact same logical attempt (same nonce) does not create a second SetupIntent', async () => {
  const adapter = new FakeStripeAdapter();
  const first = await runCreateSetupIntent({
    preparation: freshPreparation({ existingStripeCustomerId: 'cus_x' }),
    ownerId: 'owner-1',
    newAttemptNonce: 'same-nonce',
    adapter,
  });
  const second = await runCreateSetupIntent({
    preparation: freshPreparation({ existingStripeCustomerId: 'cus_x' }),
    ownerId: 'owner-1',
    newAttemptNonce: 'same-nonce',
    adapter,
  });

  assert.equal(first.stripeSetupIntentId, second.stripeSetupIntentId);
});

test('runCreateSetupIntent: metadata carries only opaque internal ids, never challenge content', async () => {
  const adapter = new FakeStripeAdapter();
  let capturedCustomerMetadata: Readonly<Record<string, string>> | undefined;
  let capturedSetupIntentMetadata: Readonly<Record<string, string>> | undefined;
  const spyAdapter = {
    ...adapter,
    createCustomer: async (params: { idempotencyKey: string; metadata: Readonly<Record<string, string>> }) => {
      capturedCustomerMetadata = params.metadata;
      return adapter.createCustomer(params);
    },
    createSetupIntent: async (params: Parameters<StripeAdapter['createSetupIntent']>[0]) => {
      capturedSetupIntentMetadata = params.metadata;
      return adapter.createSetupIntent(params);
    },
    retrieveSetupIntent: adapter.retrieveSetupIntent.bind(adapter),
  };

  await runCreateSetupIntent({
    preparation: freshPreparation({ challengeId: 'challenge-xyz', consequenceId: 'consequence-xyz' }),
    ownerId: 'owner-xyz',
    newAttemptNonce: 'nonce-xyz',
    adapter: spyAdapter,
  });

  assert.deepEqual(capturedCustomerMetadata, { kinwin_owner_id: 'owner-xyz' });
  assert.deepEqual(capturedSetupIntentMetadata, {
    kinwin_owner_id: 'owner-xyz',
    kinwin_challenge_id: 'challenge-xyz',
    kinwin_consequence_id: 'consequence-xyz',
  });
  const allValues = [...Object.values(capturedCustomerMetadata ?? {}), ...Object.values(capturedSetupIntentMetadata ?? {})];
  for (const value of allValues) {
    assert.doesNotMatch(value, /goal|behavior|recipient|invitation/i);
  }
});

test('runCreateSetupIntent: requests cards only, for future off-session use', async () => {
  const adapter = new FakeStripeAdapter();
  let capturedParams: Parameters<StripeAdapter['createSetupIntent']>[0] | undefined;
  const spyAdapter = {
    ...adapter,
    createCustomer: adapter.createCustomer.bind(adapter),
    createSetupIntent: async (params: Parameters<StripeAdapter['createSetupIntent']>[0]) => {
      capturedParams = params;
      return adapter.createSetupIntent(params);
    },
    retrieveSetupIntent: adapter.retrieveSetupIntent.bind(adapter),
  };

  await runCreateSetupIntent({
    preparation: freshPreparation({ existingStripeCustomerId: 'cus_x' }),
    ownerId: 'owner-1',
    newAttemptNonce: 'nonce-1',
    adapter: spyAdapter,
  });

  assert.deepEqual(capturedParams?.paymentMethodTypes, ['card']);
  assert.equal(capturedParams?.usage, 'off_session');
});
