import { withSupabase } from 'npm:@supabase/server@^1';
import { createTremendousSandboxAdapter, readTremendousSandboxConfig } from '../_shared/tremendous/adapter.ts';
import { runRewardFulfillmentWorker } from '../_shared/tremendous/worker.ts';
import type { TremendousResult } from '../_shared/tremendous/types.ts';

const asObject = (value: unknown) => value as Record<string, any>;

export default { fetch: withSupabase<any>({ auth: 'secret:default' }, async (req, ctx) => {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const config = readTremendousSandboxConfig((name) => Deno.env.get(name));
  if (!config) return Response.json({ error: 'sandbox_not_configured' }, { status: 503 });
  const rpc = async (name: string, args = {}) => {
    const { data, error } = await ctx.supabaseAdmin.rpc(name, args);
    if (error) throw new Error(error.code);
    return data;
  };
  try {
    const result = await runRewardFulfillmentWorker({
      start: async () => { const data = asObject(await rpc('start_reward_fulfillment_worker')); return data.status === 'already_running' ? { status: 'already_running', runId: data.runId ?? null } : { status: 'started', runId: data.runId, leaseToken: data.leaseToken }; },
      claim: async (runId, token) => (await rpc('claim_due_reward_fulfillments', { p_run_id: runId, p_lease_token: token, p_limit: 25 }) as any[]).map((row) => ({ obligationId: row.obligation_id, idempotencyKey: row.idempotency_key, amountMinorUnits: Number(row.amount_minor_units), currency: row.currency, organizerName: row.organizer_name, recipientNames: row.recipient_names, category: row.category })),
      create: createTremendousSandboxAdapter(config),
      record: async (runId, token, item, result: TremendousResult) => { await rpc('record_reward_fulfillment_result', { p_obligation_id: item.obligationId, p_run_id: runId, p_lease_token: token, p_succeeded: result.ok, p_retryable: result.ok ? false : result.retryable, p_provider_order_id: result.ok ? result.reward.orderId : null, p_provider_reward_id: result.ok ? result.reward.rewardId : null, p_failure_code: result.ok ? null : result.code }); },
      finish: async (runId, token, status, eligible, attempted, failed, error) => { await rpc('finish_reward_fulfillment_worker', { p_run_id: runId, p_lease_token: token, p_status: status, p_eligible_count: eligible, p_attempted_count: attempted, p_failed_count: failed, p_error_code: error ?? null }); },
    });
    return Response.json(result);
  } catch {
    console.error('scheduled-fulfill-rewards: worker failed');
    return Response.json({ error: 'worker_failed' }, { status: 500 });
  }
}) };
