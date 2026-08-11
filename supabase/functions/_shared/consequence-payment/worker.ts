import type { StripePaymentAdapter } from '../consequence-setup/types.ts';
import { attemptObligation, PaymentObligation, PaymentStatus } from './payment-flow.ts';

export type PaymentWorkerDependencies = {
 start():Promise<{status:'already_running';runId:string|null}|{status:'started';runId:string;leaseToken:string}>;
 claim(runId:string,token:string):Promise<readonly PaymentObligation[]>;
 adapter:StripePaymentAdapter;
 record(obligationId:string,runId:string,token:string,intentId:string|null,status:Exclude<PaymentStatus,'succeeded'>,category:string|null):Promise<void>;
 finish(runId:string,token:string,status:'succeeded'|'partial_failure'|'failed',eligible:number,attempted:number,failed:number,error?:string):Promise<void>;
};
export async function runConsequencePaymentWorker(d:PaymentWorkerDependencies) {
 const start=await d.start(); if(start.status==='already_running') return start;
 let eligible=0,attempted=0,failed=0;
 try {
  const rows=await d.claim(start.runId,start.leaseToken); eligible=rows.length;
  for(const row of rows) try {
    const result=await attemptObligation(row,d.adapter); attempted++;
    // Even a synchronous `succeeded` response remains processing here. Only
    // the independently verified webhook may persist paid truth.
    const status=result.status==='succeeded'?'processing':result.status;
    await d.record(row.obligationId,start.runId,start.leaseToken,result.intentId,status,result.category);
  } catch { failed++; await d.record(row.obligationId,start.runId,start.leaseToken,row.stripePaymentIntentId,'temporary_failure','provider_temporarily_unavailable'); }
  const status=failed?'partial_failure':'succeeded'; await d.finish(start.runId,start.leaseToken,status,eligible,attempted,failed); return {status,eligible,attempted,failed};
 } catch(e) { await d.finish(start.runId,start.leaseToken,'failed',eligible,attempted,failed,'worker_failure'); throw e; }
}
