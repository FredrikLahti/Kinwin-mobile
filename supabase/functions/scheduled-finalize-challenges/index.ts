// Dedicated service-only Cron target. This is intentionally not the
// authenticated user's finalize-challenge endpoint and never accepts an
// owner/result claim from its request body.
import { createClient } from 'npm:@supabase/supabase-js@^2';

import { ChallengeCompletionError, finalizePersistedChallenge } from '../_shared/challenge-completion/finalize.ts';
import { DueChallenge, runScheduledChallengeCompletion, WorkerCounts } from '../_shared/challenge-completion/worker.ts';

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function rpcFailure(code: string, error: { readonly message?: string }): never {
  throw new ChallengeCompletionError(code, error.message ?? code);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonError(405, 'method_not_allowed');

  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  if (request.headers.get('authorization') !== `Bearer ${serviceRoleKey}`) {
    return jsonError(401, 'unauthorized');
  }

  const admin = createClient(requiredEnvironment('SUPABASE_URL'), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await runScheduledChallengeCompletion({
      start: async () => {
        const { data, error } = await admin.rpc('start_challenge_completion_worker');
        if (error) rpcFailure('worker_start_failed', error);
        const row = data as { status?: string; runId?: string; leaseToken?: string } | null;
        if (row?.status === 'already_running') return { status: 'already_running', runId: row.runId ?? null };
        if (row?.status !== 'started' || !row.runId || !row.leaseToken) {
          throw new ChallengeCompletionError('worker_start_invalid_response', 'worker start returned an invalid response');
        }
        return { status: 'started', runId: row.runId, leaseToken: row.leaseToken };
      },
      claimDue: async () => {
        const { data, error } = await admin.rpc('claim_due_challenge_completions', { p_limit: 50 });
        if (error) rpcFailure('worker_claim_failed', error);
        return ((data ?? []) as readonly {
          challenge_id: string;
          owner_id: string;
          previous_status: DueChallenge['previousStatus'];
        }[]).map((row) => ({
          challengeId: row.challenge_id,
          ownerId: row.owner_id,
          previousStatus: row.previous_status,
        }));
      },
      finalize: async (challenge) => finalizePersistedChallenge(admin, challenge.challengeId, challenge.ownerId),
      recordFailure: async (runId, leaseToken, challengeId, errorCode) => {
        const { error } = await admin.rpc('record_challenge_completion_worker_failure', {
          p_run_id: runId,
          p_lease_token: leaseToken,
          p_challenge_id: challengeId,
          p_error_code: errorCode,
        });
        if (error) rpcFailure('worker_failure_record_failed', error);
      },
      finish: async (
        runId: string,
        leaseToken: string,
        status: 'succeeded' | 'partial_failure' | 'failed',
        counts: WorkerCounts,
        errorCode?: string,
      ) => {
        const { error } = await admin.rpc('finish_challenge_completion_worker', {
          p_run_id: runId,
          p_lease_token: leaseToken,
          p_status: status,
          p_eligible_count: counts.eligible,
          p_reconciled_count: counts.reconciled,
          p_finalized_success_count: counts.finalizedSuccess,
          p_finalized_failure_count: counts.finalizedFailure,
          p_failed_count: counts.failed,
          p_error_code: errorCode ?? null,
        });
        if (error) rpcFailure('worker_finish_failed', error);
      },
    });

    return Response.json(result, { status: result.status === 'already_running' ? 202 : 200 });
  } catch (error) {
    const code = error instanceof ChallengeCompletionError ? error.code : 'unexpected_worker_error';
    console.error('scheduled-finalize-challenges:', code);
    return jsonError(500, code);
  }
});
