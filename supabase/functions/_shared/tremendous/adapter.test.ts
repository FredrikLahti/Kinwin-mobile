import assert from 'node:assert/strict';
import test from 'node:test';
import { createTremendousSandboxAdapter, readTremendousSandboxConfig } from './adapter.ts';

const config = { apiBaseUrl: 'https://testflight.tremendous.com', apiKey: 'secret', fundingSourceId: 'BALANCE', campaignId: 'campaign' };
const item = { obligationId: 'o1', idempotencyKey: 'kinwin-reward:c1', amountMinorUnits: 7500, currency: 'USD', organizerName: 'Alex', recipientNames: ['Anna', 'Bo'], category: 'Dinner' };

test('sandbox config rejects production and incomplete configuration', () => {
  assert.equal(readTremendousSandboxConfig((key) => ({ TREMENDOUS_API_BASE_URL: 'https://api.tremendous.com', TREMENDOUS_API_KEY: 'x', TREMENDOUS_FUNDING_SOURCE_ID: 'x', TREMENDOUS_CAMPAIGN_ID: 'x' })[key]), null);
});

test('adapter maps one full-value LINK order and stable idempotency', async () => {
  let request: RequestInit | undefined;
  const adapter = createTremendousSandboxAdapter(config, async (_url, init) => { request = init; return new Response(JSON.stringify({ order: { id: 'order_1', rewards: [{ id: 'reward_1', delivery: { link: 'https://testflight.tremendous.com/rewards/1' } }] } }), { status: 200 }); });
  const result = await adapter(item);
  assert.equal(result.ok, true);
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
