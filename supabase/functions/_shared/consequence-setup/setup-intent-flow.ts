import { buildCustomerMetadata, buildSetupIntentMetadata } from './metadata.ts';
import { SetupIntentResult, SetupPreparation, StripeAdapter } from './types.ts';

/**
 * Decides what, if anything, to call Stripe for, given the result of
 * `private.prepare_consequence_setup`, and returns the minimum the future
 * client integration needs. Never creates a new Stripe Customer or
 * SetupIntent when an existing one can be reused — this is what keeps
 * repeated calls for the same current setup attempt from creating
 * uncontrolled duplicates.
 *
 * `newAttemptNonce` is caller-supplied (not generated internally) so this
 * function stays deterministic and easy to test: it becomes part of the
 * SetupIntent's idempotency key, deduplicating a retried Stripe call within
 * one logical creation attempt without ever being persisted itself.
 */
export async function runCreateSetupIntent(params: {
  readonly preparation: SetupPreparation;
  readonly ownerId: string;
  readonly newAttemptNonce: string;
  readonly adapter: StripeAdapter;
}): Promise<SetupIntentResult> {
  const { preparation, ownerId, newAttemptNonce, adapter } = params;

  if (preparation.reusableStripeSetupIntentId) {
    const intent = await adapter.retrieveSetupIntent(preparation.reusableStripeSetupIntentId);
    return {
      consequenceId: preparation.consequenceId,
      clientSecret: intent.clientSecret,
      stripeSetupIntentId: intent.id,
      stripeCustomerId: intent.customerId,
      reused: true,
    };
  }

  const customer = preparation.existingStripeCustomerId
    ? { id: preparation.existingStripeCustomerId }
    : await adapter.createCustomer({
        // Deterministic per owner (not per call): concurrent callers for
        // the same owner converge on the very same Stripe Customer even
        // without a database-level lock, because Stripe itself dedupes by
        // this key.
        idempotencyKey: `kinwin-customer:${ownerId}`,
        metadata: buildCustomerMetadata({ ownerId }),
      });

  const setupIntent = await adapter.createSetupIntent({
    customerId: customer.id,
    idempotencyKey: `kinwin-setup-intent:${preparation.consequenceId}:${newAttemptNonce}`,
    metadata: buildSetupIntentMetadata({ ownerId, challengeId: preparation.challengeId, consequenceId: preparation.consequenceId }),
    paymentMethodTypes: ['card'],
    usage: 'off_session',
  });

  return {
    consequenceId: preparation.consequenceId,
    clientSecret: setupIntent.clientSecret,
    stripeSetupIntentId: setupIntent.id,
    stripeCustomerId: customer.id,
    reused: false,
  };
}
