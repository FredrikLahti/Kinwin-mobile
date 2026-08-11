import type { TremendousReconciliationResult } from './types.ts';

export type ReconciliationItem = { readonly obligationId: string; readonly providerRewardId: string };
export type ReconciliationWorkerDependencies = {
  start(): Promise<{ status: 'already_running'; runId: string | null } | { status: 'started'; runId: string; leaseToken: string }>;
  claim(runId: string, token: string): Promise<readonly ReconciliationItem[]>;
  retrieve(providerRewardId: string): Promise<TremendousReconciliationResult>;
  record(runId: string, token: string, item: ReconciliationItem, result: TremendousReconciliationResult): Promise<void>;
  finish(runId: string, token: string, status: 'succeeded' | 'partial_failure' | 'failed', eligible: number, attempted: number, failed: number, error?: string): Promise<void>;
};

export async function runRewardReconciliationWorker(dependencies: ReconciliationWorkerDependencies) {
  const start = await dependencies.start();
  if (start.status === 'already_running') return start;
  let eligible = 0; let attempted = 0; let failed = 0;
  try {
    const rows = await dependencies.claim(start.runId, start.leaseToken); eligible = rows.length;
    for (const row of rows) {
      const result = await dependencies.retrieve(row.providerRewardId); attempted += 1;
      if (result.kind === 'failure') failed += 1;
      await dependencies.record(start.runId, start.leaseToken, row, result);
    }
    const status = failed ? 'partial_failure' : 'succeeded';
    await dependencies.finish(start.runId, start.leaseToken, status, eligible, attempted, failed);
    return { status, eligible, attempted, failed };
  } catch (error) {
    await dependencies.finish(start.runId, start.leaseToken, 'failed', eligible, attempted, failed, 'reconciliation_worker_failure');
    throw error;
  }
}
