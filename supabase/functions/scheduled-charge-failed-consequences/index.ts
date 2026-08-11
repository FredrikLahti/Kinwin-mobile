import { withSupabase } from 'npm:@supabase/server@^1';
import { createRealStripeAdapter } from '../_shared/real-stripe-adapter.ts';
import { runConsequencePaymentWorker } from '../_shared/consequence-payment/worker.ts';
const key=Deno.env.get('STRIPE_SECRET_KEY');
export default {fetch:withSupabase<any>({auth:'secret:default'},async(req,ctx)=>{
 if(req.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
 if(!key){console.error('scheduled-charge-failed-consequences: Stripe is not configured');return Response.json({error:'server_configuration_error'},{status:500});}
 const a=ctx.supabaseAdmin; const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await a.rpc(name,args);if(error)throw new Error(name);return data;};
 try{return Response.json(await runConsequencePaymentWorker({
  adapter:createRealStripeAdapter(key),
  start:async()=>await rpc('start_consequence_payment_worker') as any,
  claim:async(runId,token)=>((await rpc('claim_due_consequence_payments',{p_run_id:runId,p_lease_token:token,p_limit:25})) as any[]).map(x=>({obligationId:x.obligation_id,challengeId:x.challenge_id,ownerId:x.owner_id,amountMinorUnits:Number(x.amount_minor_units),currency:x.currency,stripeCustomerId:x.stripe_customer_id,stripePaymentMethodId:x.stripe_payment_method_id,stripePaymentIntentId:x.stripe_payment_intent_id,retryCount:x.retry_count})),
  record:async(id,runId,token,pi,status,category)=>{await rpc('record_consequence_payment_intent',{p_obligation_id:id,p_run_id:runId,p_lease_token:token,p_stripe_payment_intent_id:pi,p_status:status,p_failure_category:category});},
  finish:async(runId,token,status,eligible,attempted,failed,error)=>{await rpc('finish_consequence_payment_worker',{p_run_id:runId,p_lease_token:token,p_status:status,p_eligible_count:eligible,p_attempted_count:attempted,p_failed_count:failed,p_error_code:error??null});},
 }));}catch{console.error('scheduled-charge-failed-consequences: worker failed');return Response.json({error:'worker_failed'},{status:500});}
 })};
