import assert from 'node:assert/strict';
import test from 'node:test';
import { runRewardReconciliationWorker } from './reconciliation-worker.ts';

test('reconciliation never creates another order and records one normalized result', async () => {
  let retrievals = 0; const recorded: string[] = [];
  const result = await runRewardReconciliationWorker({
    start: async () => ({ status: 'started', runId: 'run', leaseToken: 'lease' }),
    claim: async () => [{ obligationId: 'obligation', providerRewardId: 'reward', providerOrderId: 'order' }],
    retrieve: async (id,orderId) => { retrievals++; assert.equal(orderId,'order'); return { kind: 'processing', providerStatus: id.toUpperCase() }; },
    record: async (_run, _token, item) => { recorded.push(item.obligationId); }, finish: async () => {},
  });
  assert.deepEqual(result, { status: 'succeeded', eligible: 1, attempted: 1, failed: 0 });
  assert.equal(retrievals, 1); assert.deepEqual(recorded, ['obligation']);
});

test('overlapping reconciliation exits before claim', async () => {
  let claimed = false;
  const result = await runRewardReconciliationWorker({ start: async () => ({ status: 'already_running', runId: 'run' }), claim: async () => { claimed = true; return []; }, retrieve: async () => ({ kind: 'processing', providerStatus: 'PROCESSING' }), record: async () => {}, finish: async () => {} });
  assert.equal(result.status, 'already_running'); assert.equal(claimed, false);
});
