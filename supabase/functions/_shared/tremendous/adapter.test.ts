import assert from 'node:assert/strict';
import test from 'node:test';
import { createTremendousReconciliationAdapter, createTremendousSandboxAdapter, readTremendousReconciliationConfig, readTremendousSandboxConfig } from './adapter.ts';

const config = { apiBaseUrl: 'https://testflight.tremendous.com', apiKey: 'secret', fundingSourceId: 'BALANCE', campaignId: 'campaign' };
const item = { obligationId: 'o1', idempotencyKey: 'kinwin-reward:c1', amountMinorUnits: 7500, currency: 'USD', organizerName: 'Alex', recipientNames: ['Anna', 'Bo'], category: 'Dinner' };

test('sandbox config rejects production and incomplete configuration', () => {
  assert.equal(readTremendousSandboxConfig((key) => ({ TREMENDOUS_API_BASE_URL: 'https://api.tremendous.com', TREMENDOUS_API_KEY: 'x', TREMENDOUS_FUNDING_SOURCE_ID: 'x', TREMENDOUS_CAMPAIGN_ID: 'x' })[key]), null);
});

test('reconciliation requires an explicitly configured ready-status contract', () => {
  const values: Record<string,string> = { TREMENDOUS_API_BASE_URL: config.apiBaseUrl, TREMENDOUS_API_KEY: config.apiKey, TREMENDOUS_FUNDING_SOURCE_ID: config.fundingSourceId, TREMENDOUS_CAMPAIGN_ID: config.campaignId };
  assert.equal(readTremendousReconciliationConfig((key) => values[key]), null);
  values.TREMENDOUS_READY_REWARD_STATUSES = 'delivered, available';
  values.TREMENDOUS_REWARD_PATH_TEMPLATE = '/api/v2/rewards/{rewardId}';
  assert.deepEqual([...readTremendousReconciliationConfig((key) => values[key])!.readyRewardStatuses], ['DELIVERED','AVAILABLE']);
});

test('adapter maps one full-value LINK order and stable idempotency', async () => {
  let request: RequestInit | undefined;
  const adapter = createTremendousSandboxAdapter(config, async (_url, init) => { request = init; return new Response(JSON.stringify({ order: { id: 'order_1', rewards: [{ id: 'reward_1', delivery: { link: 'https://testflight.tremendous.com/rewards/1' } }] } }), { status: 200 }); });
  const result = await adapter(item);
  assert.equal(result.ok, true);
  assert.deepEqual(result, { ok: true, reward: { orderId: 'order_1', rewardId: 'reward_1' } });
  assert.equal((request?.headers as Record<string,string>)['Idempotency-Key'], item.idempotencyKey);
  const body = JSON.parse(String(request?.body));
  assert.equal(body.reward.value.denomination, 75);
  assert.equal(body.reward.value.currency_code, 'USD');
  assert.equal(body.reward.delivery.method, 'LINK');
  assert.equal(body.reward.recipient.name, 'Alex');
  assert.equal(JSON.stringify(body).includes('Anna'), false);
});

test('adapter classifies retryable, terminal and malformed responses', async () => {
  const response = (status: number, body = '{}') => createTremendousSandboxAdapter(config, async () => new Response(body, { status }))(item);
  assert.deepEqual(await response(503), { ok: false, retryable: true, code: 'http_503' });
  assert.deepEqual(await response(422), { ok: false, retryable: false, code: 'http_422' });
  assert.deepEqual(await response(200), { ok: false, retryable: true, code: 'malformed_response' });
  assert.deepEqual(await createTremendousSandboxAdapter(config, async () => { throw new Error('offline'); })(item), { ok: false, retryable: true, code: 'network_error' });
});

test('adapter aborts a timed out request', async () => {
  const adapter = createTremendousSandboxAdapter(config, async (_url, init) => await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), 1);
  assert.deepEqual(await adapter(item), { ok: false, retryable: true, code: 'timeout' });
});

const reconciliationConfig = { ...config, readyRewardStatuses: new Set(['AVAILABLE']), rewardPathTemplate: '/api/v2/rewards/{rewardId}' };

test('reconciliation maps processing and ready without guessing readiness', async () => {
  const processing = createTremendousReconciliationAdapter(reconciliationConfig, async () => new Response(JSON.stringify({ reward: { status: 'PROCESSING' } }), { status: 200 }));
  assert.deepEqual(await processing('reward_1'), { kind: 'processing', providerStatus: 'PROCESSING' });
  const ready = createTremendousReconciliationAdapter(reconciliationConfig, async () => new Response(JSON.stringify({ reward: { status: 'AVAILABLE', delivery: { link: 'https://example.test/reward' } } }), { status: 200 }));
  assert.deepEqual(await ready('reward_1'), { kind: 'ready', providerStatus: 'AVAILABLE', redemptionUrl: 'https://example.test/reward' });
});

test('reconciliation classifies provider and transport failures', async () => {
  const response = (status: number, body = '{}') => createTremendousReconciliationAdapter(reconciliationConfig, async () => new Response(body, { status }))('reward_1');
  assert.deepEqual(await response(404), { kind: 'failure', retryable: false, code: 'unknown_provider_reward', providerStatus: null });
  assert.deepEqual(await response(429), { kind: 'failure', retryable: true, code: 'http_429', providerStatus: null });
  assert.deepEqual(await response(503), { kind: 'failure', retryable: true, code: 'http_503', providerStatus: null });
  assert.deepEqual(await response(400), { kind: 'failure', retryable: false, code: 'http_400', providerStatus: null });
  assert.deepEqual(await response(200), { kind: 'failure', retryable: true, code: 'malformed_response', providerStatus: null });
  assert.deepEqual(await createTremendousReconciliationAdapter(reconciliationConfig, async () => { throw new Error('offline'); })('reward_1'), { kind: 'failure', retryable: true, code: 'network_error', providerStatus: null });
});
