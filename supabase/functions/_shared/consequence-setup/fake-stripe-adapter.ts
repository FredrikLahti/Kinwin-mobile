import { StripeAdapter, StripeCustomer, StripePaymentAdapter, StripePaymentIntent, StripeSetupIntent } from './types.ts';

/**
 * Deterministic, in-memory stand-in for Stripe. Used by unit tests here and
 * by the Edge Function integration tests (see
 * supabase/tests/e2e/consequence-setup-stripe.e2e.ts) so CI never depends on
 * real Stripe availability. Reproduces the one behavior this flow actually
 * relies on: repeating a call with the same idempotency key returns the
 * original object instead of creating a new one — exactly like real Stripe.
 */
export class FakeStripeAdapter implements StripePaymentAdapter {
  private customersByIdempotencyKey = new Map<string, StripeCustomer>();
  private setupIntentsByIdempotencyKey = new Map<string, StripeSetupIntent>();
  private setupIntentsById = new Map<string, StripeSetupIntent>();
  private paymentIntentsByIdempotencyKey = new Map<string, StripePaymentIntent>();
  private paymentIntentsById = new Map<string, StripePaymentIntent>();
  private nextId = 1;

  /** Test hook: force the next `createSetupIntent`/`retrieveSetupIntent` result's status and payment method. */
  nextSetupIntentStatus: string = 'requires_payment_method';
  nextSetupIntentPaymentMethodId: string | null = null;
  nextPaymentIntentStatus: string = 'processing';

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

  async createPaymentIntent(params: Parameters<StripePaymentAdapter['createPaymentIntent']>[0]): Promise<StripePaymentIntent> {
    const existing=this.paymentIntentsByIdempotencyKey.get(params.idempotencyKey); if(existing) return existing;
    const intent:StripePaymentIntent={id:`pi_fake_${this.nextId++}`,status:this.nextPaymentIntentStatus,
      customerId:params.customerId,paymentMethodId:params.paymentMethodId,lastErrorType:null,lastErrorCode:null};
    this.paymentIntentsByIdempotencyKey.set(params.idempotencyKey,intent); this.paymentIntentsById.set(intent.id,intent); return intent;
  }
  async confirmPaymentIntent(id:string,params:Parameters<StripePaymentAdapter['confirmPaymentIntent']>[1]):Promise<StripePaymentIntent>{
    const old=this.paymentIntentsById.get(id); if(!old) throw new Error(`FakeStripeAdapter: no such PaymentIntent ${id}`);
    const next={...old,status:this.nextPaymentIntentStatus,paymentMethodId:params.paymentMethodId}; this.paymentIntentsById.set(id,next); return next;
  }
  async retrievePaymentIntent(id:string):Promise<StripePaymentIntent>{const i=this.paymentIntentsById.get(id);if(!i)throw new Error(`FakeStripeAdapter: no such PaymentIntent ${id}`);return i;}
  resolvePayment(id:string,status:string,lastErrorCode:string|null=null):void{const i=this.paymentIntentsById.get(id);if(!i)throw new Error(`FakeStripeAdapter: no such PaymentIntent ${id}`);this.paymentIntentsById.set(id,{...i,status,lastErrorCode,lastErrorType:lastErrorCode?'card_error':null});}

  /** Test hook: simulate the SetupIntent reaching a terminal state, as the real webhook flow would observe on retrieval. */
  resolve(id: string, status: string, paymentMethodId: string | null): void {
    const intent = this.setupIntentsById.get(id);
    if (!intent) throw new Error(`FakeStripeAdapter: no such SetupIntent ${id}`);
    const resolved: StripeSetupIntent = { ...intent, status, paymentMethodId };
    this.setupIntentsById.set(id, resolved);
  }
}
