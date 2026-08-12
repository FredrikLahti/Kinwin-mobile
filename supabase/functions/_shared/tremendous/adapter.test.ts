import assert from 'node:assert/strict';
import test from 'node:test';
import { createTremendousGenerateLinkAdapter, createTremendousReconciliationAdapter, createTremendousSandboxAdapter, readTremendousSandboxConfig } from './adapter.ts';

const config = { apiBaseUrl: 'https://testflight.tremendous.com', apiKey: 'TEST_secret', fundingSourceId: 'BALANCE', campaignId: 'campaign' };
const item = { obligationId: 'o1', idempotencyKey: 'kinwin-reward:c1', amountMinorUnits: 7500, currency: 'USD', organizerName: 'Alex', recipientNames: ['Anna', 'Bo'], category: 'Dinner' };

test('sandbox config rejects production, non-test keys and incomplete configuration', () => {
  assert.equal(readTremendousSandboxConfig((key) => ({ TREMENDOUS_API_BASE_URL: 'https://api.tremendous.com', TREMENDOUS_API_KEY: 'TEST_x', TREMENDOUS_FUNDING_SOURCE_ID: 'x', TREMENDOUS_CAMPAIGN_ID: 'x' })[key]), null);
  assert.equal(readTremendousSandboxConfig((key) => ({ TREMENDOUS_API_BASE_URL: config.apiBaseUrl, TREMENDOUS_API_KEY: 'LIVE_x', TREMENDOUS_FUNDING_SOURCE_ID: 'x', TREMENDOUS_CAMPAIGN_ID: 'x' })[key]), null);
});

test('creation uses external_id for idempotency, LINK delivery, and discards response link', async () => {
  let request: RequestInit | undefined;
  const adapter = createTremendousSandboxAdapter(config, async (_url, init) => { request = init; return new Response(JSON.stringify({ order: { id: 'order_1', rewards: [{ id: 'reward_1', delivery: { link: 'https://sensitive.example/link' } }] } }), { status: 200 }); });
  assert.deepEqual(await adapter(item), { ok: true, reward: { orderId: 'order_1', rewardId: 'reward_1' } });
  const headers = request?.headers as Record<string,string>;
  assert.equal(headers['Idempotency-Key'], undefined);
  const body = JSON.parse(String(request?.body));
  assert.equal(body.external_id, item.idempotencyKey);
  assert.equal(body.reward.delivery.method, 'LINK');
  assert.equal(body.reward.value.denomination, 75);
  assert.equal(JSON.stringify(body).includes('Anna'), false);
});

test('creation retries reuse the same documented external_id', async () => {
  const ids:string[]=[];const adapter=createTremendousSandboxAdapter(config,async(_url,init)=>{ids.push(JSON.parse(String(init?.body)).external_id);return new Response(JSON.stringify({order:{id:'order_1',rewards:[{id:'reward_1'}]}}),{status:200});});
  await adapter(item);await adapter(item);assert.deepEqual(ids,[item.idempotencyKey,item.idempotencyKey]);
});

test('creation classifies retryable, terminal, malformed, timeout and network responses', async () => {
  const response = (status: number, body = '{}') => createTremendousSandboxAdapter(config, async () => new Response(body, { status }))(item);
  assert.deepEqual(await response(503), { ok: false, retryable: true, code: 'http_503' });
  assert.deepEqual(await response(422), { ok: false, retryable: false, code: 'http_422' });
  assert.deepEqual(await response(200), { ok: false, retryable: true, code: 'malformed_response' });
  assert.deepEqual(await createTremendousSandboxAdapter(config, async () => { throw new Error('offline'); })(item), { ok: false, retryable: true, code: 'network_error' });
  const timeout=createTremendousSandboxAdapter(config,async(_url,init)=>await new Promise<Response>((_r,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))),1);
  assert.deepEqual(await timeout(item),{ok:false,retryable:true,code:'timeout'});
});

const reward = (status:string,method='LINK',extra:Record<string,unknown>={}) => JSON.stringify({reward:{id:'reward_1',order_id:'order_1',delivery:{method,status},...extra}});
test('retrieval implements the verified LINK delivery status contract', async () => {
  const get=(body:string)=>createTremendousReconciliationAdapter(config,async()=>new Response(body,{status:200}))('reward_1','order_1');
  assert.deepEqual(await get(reward('SUCCEEDED')),{kind:'ready',providerStatus:'SUCCEEDED'});
  assert.deepEqual(await get(reward('PENDING')),{kind:'processing',providerStatus:'PENDING'});
  assert.deepEqual(await get(reward('SCHEDULED')),{kind:'processing',providerStatus:'SCHEDULED'});
  assert.deepEqual(await get(reward('FAILED')),{kind:'failure',retryable:false,code:'provider_delivery_failed',providerStatus:'FAILED'});
  assert.deepEqual(await get(reward('MYSTERY')),{kind:'failure',retryable:false,code:'unknown_delivery_status',providerStatus:'MYSTERY'});
  assert.deepEqual(await get(reward('SUCCEEDED','EMAIL')),{kind:'failure',retryable:false,code:'unsupported_delivery_method',providerStatus:'SUCCEEDED'});
  assert.deepEqual(await get(JSON.stringify({reward:{id:'other',order_id:'order_1',delivery:{method:'LINK',status:'SUCCEEDED'}}})),{kind:'failure',retryable:false,code:'provider_identity_mismatch',providerStatus:'SUCCEEDED'});
});

test('retrieval classifies HTTP and malformed failures safely', async () => {
  const response=(status:number,body='{}')=>createTremendousReconciliationAdapter(config,async()=>new Response(body,{status}))('reward_1','order_1');
  assert.deepEqual(await response(404),{kind:'failure',retryable:false,code:'unknown_provider_reward',providerStatus:null});
  assert.deepEqual(await response(429),{kind:'failure',retryable:true,code:'http_429',providerStatus:null});
  assert.deepEqual(await response(503),{kind:'failure',retryable:true,code:'http_503',providerStatus:null});
  assert.deepEqual(await response(200),{kind:'failure',retryable:false,code:'provider_identity_mismatch',providerStatus:null});
});

test('generate_link validates reward identity and HTTPS without persisting anything', async () => {
  let count=0;const generated=createTremendousGenerateLinkAdapter(config,async()=>new Response(JSON.stringify({reward:{id:'reward_1',delivery:{link:`https://sensitive.example/fresh-${++count}`}}}),{status:200}));
  assert.deepEqual(await generated('reward_1'),{ok:true,url:'https://sensitive.example/fresh-1'});
  assert.deepEqual(await generated('reward_1'),{ok:true,url:'https://sensitive.example/fresh-2'});
  const malformed=createTremendousGenerateLinkAdapter(config,async()=>new Response(JSON.stringify({reward:{id:'other',delivery:{link:'http://unsafe.example'}}}),{status:200}));
  assert.deepEqual(await malformed('reward_1'),{ok:false,retryable:false,code:'malformed_link_response'});
});
