import assert from 'node:assert/strict';
import test from 'node:test';
import { runRewardFulfillmentWorker } from './worker.ts';

const item = { obligationId: 'o1', idempotencyKey: 'kinwin-reward:c1', amountMinorUnits: 5000, currency: 'USD', organizerName: 'Alex', recipientNames: ['Anna'], category: 'Dinner' };

test('worker does nothing while another run owns the lease', async () => {
  let claims = 0;
  const result = await runRewardFulfillmentWorker({ start: async () => ({ status: 'already_running', runId: 'r1' }), claim: async () => { claims++; return []; }, create: async () => ({ ok: false, retryable: true, code: 'unused' }), record: async () => {}, finish: async () => {} });
  assert.equal(result.status, 'already_running');
  assert.equal(claims, 0);
});

test('worker records provider result once for each claimed obligation', async () => {
  const recorded: string[] = [];
  const result = await runRewardFulfillmentWorker({ start: async () => ({ status: 'started', runId: 'r1', leaseToken: 't1' }), claim: async () => [item], create: async () => ({ ok: true, reward: { orderId: 'order', rewardId: 'reward', redemptionUrl: 'https://example.test/r' } }), record: async (_r, _t, row) => { recorded.push(row.idempotencyKey); }, finish: async () => {} });
  assert.deepEqual(result, { status: 'succeeded', eligible: 1, attempted: 1, failed: 0 });
  assert.deepEqual(recorded, ['kinwin-reward:c1']);
});
