import assert from 'node:assert/strict'; import test from 'node:test';
import { FakeStripeAdapter } from '../consequence-setup/fake-stripe-adapter';
import { attemptObligation, classifyPaymentIntent, planPaymentWebhook } from './payment-flow';
const obligation={obligationId:'obl-1',challengeId:'challenge-1',ownerId:'owner-1',amountMinorUnits:2500,currency:'USD',stripeCustomerId:'cus-1',stripePaymentMethodId:'pm-1',stripePaymentIntentId:null,retryCount:1};
test('creates one intent with deterministic identity on repeated creation',async()=>{const a=new FakeStripeAdapter();const x=await attemptObligation(obligation,a);const y=await attemptObligation(obligation,a);assert.equal(x.intentId,y.intentId);});

// True multi-currency V1: consequences.currency -> obligation.currency ->
// Stripe PaymentIntent currency, lowercased for Stripe's own API
// convention (SEK -> 'sek', EUR -> 'eur', USD -> 'usd'), with the amount
// passed through unchanged — no Kinwin-side FX anywhere in this path.
for (const [currency, expectedStripeCurrency] of [['USD', 'usd'], ['SEK', 'sek'], ['EUR', 'eur']] as const) {
  test(`obligation currency ${currency} reaches the Stripe adapter as lowercase '${expectedStripeCurrency}' with the amount unchanged`, async () => {
    let capturedParams: Parameters<FakeStripeAdapter['createPaymentIntent']>[0] | undefined;
    const adapter = new FakeStripeAdapter();
    const originalCreate = adapter.createPaymentIntent.bind(adapter);
    adapter.createPaymentIntent = async (params) => { capturedParams = params; return originalCreate(params); };
    await attemptObligation({ ...obligation, currency, obligationId: `obl-${currency}` }, adapter);
    assert.equal(capturedParams?.currency, expectedStripeCurrency);
    assert.equal(capturedParams?.amount, obligation.amountMinorUnits);
  });
}
test('classifies paid, authentication, replacement and processing states',()=>{const b={id:'pi',customerId:'cus',paymentMethodId:'pm',lastErrorType:null,lastErrorCode:null};assert.equal(classifyPaymentIntent({...b,status:'succeeded'}).status,'succeeded');assert.equal(classifyPaymentIntent({...b,status:'requires_payment_method',lastErrorCode:'authentication_required'}).status,'requires_action');assert.equal(classifyPaymentIntent({...b,status:'requires_payment_method',lastErrorCode:'card_declined'}).status,'requires_payment_method');assert.equal(classifyPaymentIntent({...b,status:'processing'}).status,'processing');});
test('maps only required PaymentIntent webhook events',()=>{const i={id:'pi',status:'succeeded',customerId:'cus',paymentMethodId:'pm',lastErrorType:null,lastErrorCode:null};assert.equal(planPaymentWebhook({id:'evt',type:'payment_intent.succeeded'},i)?.status,'succeeded');assert.equal(planPaymentWebhook({id:'evt2',type:'charge.succeeded'},i),null);});
