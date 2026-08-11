// Deno-only: wraps the official `stripe` package via its native `deno`
// export target (see https://github.com/stripe/stripe-node — the `deno`
// condition has shipped since stripe-node 11.16, and the current major,
// pinned below, is what stripe.com/docs' own Supabase Edge Function
// examples pin as of this writing). Not unit-tested directly — there is no
// Deno runtime in this repository's own dev/CI sandbox for that — but it is
// deliberately thin: the only logic worth testing (which Stripe calls to
// make, with which idempotency keys and metadata, in which order) lives in
// ./consequence-setup/*.ts and is unit-tested there (via `node --test`,
// see tsconfig.test.json) with FakeStripeAdapter. This file's only job is
// turning that same `StripeAdapter` interface into real Stripe API calls.
import Stripe from 'npm:stripe@^22';

import type { StripeCustomer, StripePaymentAdapter, StripePaymentIntent, StripeSetupIntent } from './consequence-setup/types.ts';

export function createRealStripeAdapter(secretKey: string): StripePaymentAdapter {
  const stripe = new Stripe(secretKey);

  return {
    async createCustomer({ idempotencyKey, metadata }): Promise<StripeCustomer> {
      const customer = await stripe.customers.create({ metadata }, { idempotencyKey });
      return { id: customer.id };
    },

    async createSetupIntent({ customerId, idempotencyKey, metadata, paymentMethodTypes, usage }): Promise<StripeSetupIntent> {
      const intent = await stripe.setupIntents.create(
        {
          customer: customerId,
          metadata,
          payment_method_types: [...paymentMethodTypes],
          usage,
        },
        { idempotencyKey },
      );
      return toStripeSetupIntent(intent, customerId);
    },

    async retrieveSetupIntent(id: string): Promise<StripeSetupIntent> {
      const intent = await stripe.setupIntents.retrieve(id);
      const customerId = typeof intent.customer === 'string' ? intent.customer : (intent.customer?.id ?? '');
      return toStripeSetupIntent(intent, customerId);
    },
    async createPaymentIntent({ customerId, paymentMethodId, amount, currency, idempotencyKey, metadata }): Promise<StripePaymentIntent> {
      const intent = await stripe.paymentIntents.create({
        amount, currency, customer: customerId, payment_method: paymentMethodId,
        confirm: true, off_session: true, payment_method_types: ['card'], metadata,
      }, { idempotencyKey });
      return toStripePaymentIntent(intent);
    },
    async confirmPaymentIntent(id: string, { paymentMethodId }: { readonly paymentMethodId: string }): Promise<StripePaymentIntent> {
      return toStripePaymentIntent(await stripe.paymentIntents.confirm(id, { payment_method: paymentMethodId, off_session: true }));
    },
    async retrievePaymentIntent(id: string): Promise<StripePaymentIntent> {
      return toStripePaymentIntent(await stripe.paymentIntents.retrieve(id));
    },
  };
}

function toStripePaymentIntent(intent: Stripe.PaymentIntent): StripePaymentIntent {
  return {
    id: intent.id,
    status: intent.status,
    customerId: typeof intent.customer === 'string' ? intent.customer : (intent.customer?.id ?? ''),
    paymentMethodId: typeof intent.payment_method === 'string' ? intent.payment_method : (intent.payment_method?.id ?? null),
    lastErrorType: intent.last_payment_error?.type ?? null,
    lastErrorCode: intent.last_payment_error?.code ?? null,
  };
}

function toStripeSetupIntent(intent: Stripe.SetupIntent, customerId: string): StripeSetupIntent {
  if (!intent.client_secret) {
    // Should be unreachable for a freshly created or retrieved SetupIntent
    // in our own account, but this is exactly the kind of assumption worth
    // failing loudly on rather than silently returning an unusable secret.
    throw new Error(`Stripe SetupIntent ${intent.id} has no client_secret`);
  }
  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status,
    customerId,
    paymentMethodId: typeof intent.payment_method === 'string' ? intent.payment_method : (intent.payment_method?.id ?? null),
  };
}
