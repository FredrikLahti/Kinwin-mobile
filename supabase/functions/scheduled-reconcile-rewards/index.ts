import { withSupabase } from 'npm:@supabase/server@^1';
import { createTremendousReconciliationAdapter, readTremendousSandboxConfig } from '../_shared/tremendous/adapter.ts';
import { runRewardReconciliationWorker } from '../_shared/tremendous/reconciliation-worker.ts';
import type { TremendousReconciliationResult } from '../_shared/tremendous/types.ts';

const asObject = (value: unknown) => value as Record<string, any>;

export default { fetch: withSupabase<any>({ auth: 'secret:default' }, async (req, ctx) => {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const config = readTremendousSandboxConfig((name) => Deno.env.get(name));
  if (!config) return Response.json({ error: 'sandbox_not_configured' }, { status: 503 });
  const rpc = async (name: string, args = {}) => { const { data, error } = await ctx.supabaseAdmin.rpc(name, args); if (error) throw new Error(error.code); return data; };
  try {
    const result = await runRewardReconciliationWorker({
      start: async () => { const data = asObject(await rpc('start_reward_fulfillment_worker')); return data.status === 'already_running' ? { status: 'already_running', runId: data.runId ?? null } : { status: 'started', runId: data.runId, leaseToken: data.leaseToken }; },
      claim: async (runId, token) => (await rpc('claim_due_reward_reconciliations', { p_run_id: runId, p_lease_token: token, p_limit: 25 }) as any[]).map((row) => ({ obligationId: row.obligation_id, providerRewardId: row.provider_reward_id, providerOrderId: row.provider_order_id })),
      retrieve: createTremendousReconciliationAdapter(config),
      record: async (runId, token, item, providerResult: TremendousReconciliationResult) => { await rpc('record_reward_reconciliation_result', { p_obligation_id: item.obligationId, p_run_id: runId, p_lease_token: token, p_result: providerResult.kind, p_provider_status: providerResult.providerStatus, p_retryable: providerResult.kind === 'failure' ? providerResult.retryable : false, p_failure_code: providerResult.kind === 'failure' ? providerResult.code : null }); },
      finish: async (runId, token, status, eligible, attempted, failed, error) => { await rpc('finish_reward_fulfillment_worker', { p_run_id: runId, p_lease_token: token, p_status: status, p_eligible_count: eligible, p_attempted_count: attempted, p_failed_count: failed, p_error_code: error ?? null }); },
    });
    return Response.json(result);
  } catch {
    console.error('scheduled-reconcile-rewards: worker failed');
    return Response.json({ error: 'worker_failed' }, { status: 500 });
  }
}) };
