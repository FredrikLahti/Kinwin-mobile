import assert from 'node:assert/strict';import test from 'node:test';import {FakeStripeAdapter} from '../consequence-setup/fake-stripe-adapter';import {runConsequencePaymentWorker} from './worker';
const row=(id:string)=>({obligationId:id,challengeId:`c-${id}`,ownerId:'o',amountMinorUnits:1000,currency:'usd',stripeCustomerId:'cus',stripePaymentMethodId:'pm',stripePaymentIntentId:null,retryCount:1});
test('one bad obligation does not block another and API success awaits webhook',async()=>{const a=new FakeStripeAdapter();a.nextPaymentIntentStatus='succeeded';const records:unknown[][]=[];let calls=0;const original=a.createPaymentIntent.bind(a);a.createPaymentIntent=async p=>{calls++;if(calls===1)throw new Error('network');return original(p)};const result=await runConsequencePaymentWorker({adapter:a,start:async()=>({status:'started',runId:'r',leaseToken:'t'}),claim:async()=>[row('bad'),row('good')],record:async(...x)=>{records.push(x)},finish:async()=>{}});assert.ok('failed' in result);if(!('failed' in result))return;assert.equal(result.failed,1);assert.equal(result.attempted,1);assert.equal(records[0][4],'temporary_failure');assert.equal(records[1][4],'processing');});
// A deterministic provider error (e.g. amount_too_small) is a completed,
// correctly-classified attempt, not a worker execution failure — it must
// count toward `attempted`, be recorded as permanently_failed, and NOT
// count toward `failed` (which is reserved for genuinely uncertain/thrown
// outcomes the worker's own catch-all handles), so the run reports
// 'succeeded' rather than 'partial_failure' for a cleanly terminal result.
test('a deterministic amount_too_small provider error is recorded as permanently_failed and does not count as a worker failure',async()=>{
  const a=new FakeStripeAdapter();
  a.createPaymentIntent=async()=>{throw Object.assign(new Error('too small'),{code:'amount_too_small'});};
  const records:unknown[][]=[];
  const result=await runConsequencePaymentWorker({adapter:a,start:async()=>({status:'started',runId:'r',leaseToken:'t'}),claim:async()=>[row('deterministic')],record:async(...x)=>{records.push(x)},finish:async()=>{}});
  assert.ok('failed' in result);
  if(!('failed' in result))return;
  assert.equal(result.attempted,1);
  assert.equal(result.failed,0);
  assert.equal(result.status,'succeeded');
  assert.equal(records[0][4],'permanently_failed');
  assert.equal(records[0][3],null);
});

test('already running worker makes no claim',async()=>{const a=new FakeStripeAdapter();const result=await runConsequencePaymentWorker({adapter:a,start:async()=>({status:'already_running',runId:'r'}),claim:async()=>{throw Error()},record:async()=>{},finish:async()=>{}});assert.equal(result.status,'already_running');});
