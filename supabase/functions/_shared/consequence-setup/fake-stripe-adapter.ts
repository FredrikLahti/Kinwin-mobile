import { StripeAdapter, StripeCustomer, StripeSetupIntent } from './types.ts';

/**
 * Deterministic, in-memory stand-in for Stripe. Used by unit tests here and
 * by the Edge Function integration tests (see
 * supabase/tests/e2e/consequence-setup-stripe.e2e.ts) so CI never depends on
 * real Stripe availability. Reproduces the one behavior this flow actually
 * relies on: repeating a call with the same idempotency key returns the
 * original object instead of creating a new one — exactly like real Stripe.
 */
export class FakeStripeAdapter implements StripeAdapter {
  private customersByIdempotencyKey = new Map<string, StripeCustomer>();
  private setupIntentsByIdempotencyKey = new Map<string, StripeSetupIntent>();
  private setupIntentsById = new Map<string, StripeSetupIntent>();
  private nextId = 1;

  /** Test hook: force the next `createSetupIntent`/`retrieveSetupIntent` result's status and payment method. */
  nextSetupIntentStatus: string = 'requires_payment_method';
  nextSetupIntentPaymentMethodId: string | null = null;

  async createCustomer(params: Parameters<StripeAdapter['createCustomer']>[0]): Promise<StripeCustomer> {
    const existing = this.customersByIdempotencyKey.get(params.idempotencyKey);
    if (existing) return existing;
    const customer: StripeCustomer = { id: `cus_fake_${this.nextId++}` };
    this.customersByIdempotencyKey.set(params.idempotencyKey, customer);
    return customer;
  }

  async createSetupIntent(params: Parameters<StripeAdapter['createSetupIntent']>[0]): Promise<StripeSetupIntent> {
    const existing = this.setupIntentsByIdempotencyKey.get(params.idempotencyKey);
    if (existing) return existing;
    const intent: StripeSetupIntent = {
      id: `seti_fake_${this.nextId++}`,
      clientSecret: `seti_fake_secret_${this.nextId}`,
      status: this.nextSetupIntentStatus,
      customerId: params.customerId,
      paymentMethodId: this.nextSetupIntentPaymentMethodId,
    };
    this.setupIntentsByIdempotencyKey.set(params.idempotencyKey, intent);
    this.setupIntentsById.set(intent.id, intent);
    return intent;
  }

  async retrieveSetupIntent(id: string): Promise<StripeSetupIntent> {
    const intent = this.setupIntentsById.get(id);
    if (!intent) throw new Error(`FakeStripeAdapter: no such SetupIntent ${id}`);
    return intent;
  }

  /** Test hook: simulate the SetupIntent reaching a terminal state, as the real webhook flow would observe on retrieval. */
  resolve(id: string, status: string, paymentMethodId: string | null): void {
    const intent = this.setupIntentsById.get(id);
    if (!intent) throw new Error(`FakeStripeAdapter: no such SetupIntent ${id}`);
    const resolved: StripeSetupIntent = { ...intent, status, paymentMethodId };
    this.setupIntentsById.set(id, resolved);
  }
}
