/**
 * Pure, runtime-agnostic types and orchestration logic for the trusted
 * Stripe consequence-setup flow (see supabase/functions/create-consequence-setup-intent
 * and supabase/functions/stripe-consequence-webhook). Deliberately has no
 * dependency on Deno, Node, or the real Stripe SDK, so it is testable with
 * this repo's ordinary `node --test` unit tests — the Edge Function
 * entrypoints are thin Deno-specific wiring around these functions, never
 * where the actual decisions are made.
 */

export type StripeCustomer = { readonly id: string };

export type StripeSetupIntent = {
  readonly id: string;
  readonly clientSecret: string;
  readonly status: string;
  readonly customerId: string;
  readonly paymentMethodId: string | null;
};

/** Injectable Stripe boundary. The real implementation wraps `npm:stripe`; tests use an in-memory fake. */
export interface StripeAdapter {
  createCustomer(params: { readonly idempotencyKey: string; readonly metadata: Readonly<Record<string, string>> }): Promise<StripeCustomer>;
  createSetupIntent(params: {
    readonly customerId: string;
    readonly idempotencyKey: string;
    readonly metadata: Readonly<Record<string, string>>;
    /** This first package supports cards only. */
    readonly paymentMethodTypes: readonly ['card'];
    /** The saved method is for a future, possibly-offline charge — never confirmed in this same session. */
    readonly usage: 'off_session';
  }): Promise<StripeSetupIntent>;
  retrieveSetupIntent(id: string): Promise<StripeSetupIntent>;
}

/** Shape returned by `private.prepare_consequence_setup`. */
export type SetupPreparation = {
  readonly challengeId: string;
  readonly consequenceId: string;
  readonly existingStripeCustomerId: string | null;
  readonly reusableSetupAttemptId: string | null;
  readonly reusableStripeSetupIntentId: string | null;
};

/** Minimum the client needs to open PaymentSheet in a future package. Never includes anything beyond this. */
export type SetupIntentResult = {
  readonly consequenceId: string;
  readonly clientSecret: string;
  readonly stripeSetupIntentId: string;
  readonly stripeCustomerId: string;
  readonly reused: boolean;
};

export type WebhookStatus = 'succeeded' | 'failed' | 'canceled';

/** Arguments for `private.apply_consequence_setup_event`, derived from a verified Stripe event. */
export type WebhookApplication = {
  readonly stripeEventId: string;
  readonly eventType: string;
  readonly stripeSetupIntentId: string;
  readonly stripeCustomerId: string;
  readonly stripePaymentMethodId: string | null;
  readonly status: WebhookStatus;
};
