import { createTremendousGenerateLinkAdapter, createTremendousReconciliationAdapter, createTremendousSandboxAdapter, readTremendousSandboxConfig } from '../supabase/functions/_shared/tremendous/adapter.ts';

if (Deno.env.get('KINWIN_ALLOW_TESTFLIGHT_ORDER') !== 'I_UNDERSTAND_THIS_CREATES_A_TEST_REWARD') {
  console.error('Refusing to create a Testflight reward without the explicit opt-in flag.'); Deno.exit(1);
}
const config = readTremendousSandboxConfig((name) => Deno.env.get(name));
if (!config) { console.error('Valid Tremendous Testflight configuration is required.'); Deno.exit(1); }
const externalId = Deno.env.get('TREMENDOUS_SMOKE_EXTERNAL_ID') ?? '';
const amount = Number(Deno.env.get('TREMENDOUS_SMOKE_AMOUNT_MINOR_UNITS'));
if (!/^kinwin-beta-smoke:[A-Za-z0-9_-]{8,80}$/.test(externalId) || !Number.isSafeInteger(amount) || amount < 1) {
  console.error('A stable beta-smoke external id and positive minor-unit amount are required.'); Deno.exit(1);
}

const create = createTremendousSandboxAdapter(config);
const item = { obligationId:'beta-smoke', idempotencyKey:externalId, amountMinorUnits:amount, currency:'USD', organizerName:'Kinwin Test Organizer', recipientNames:['Kinwin Test Recipient'], category:'Beta smoke' };
const first = await create(item); const second = await create(item);
if (!first.ok || !second.ok || first.reward.orderId !== second.reward.orderId || first.reward.rewardId !== second.reward.rewardId) {
  console.error('Testflight creation or external_id idempotency verification failed.'); Deno.exit(1);
}
console.log(`PASS Testflight order idempotency. Order ${first.reward.orderId}; reward ${first.reward.rewardId}.`);
const state = await createTremendousReconciliationAdapter(config)(first.reward.rewardId, first.reward.orderId);
if (state.kind === 'failure') {
  console.error(`FAIL reward retrieval failed: ${state.code}${state.providerStatus ? ` (provider status ${state.providerStatus})` : ''}.`);
  Deno.exit(1);
}
console.log(`PASS reward retrieval classified as ${state.kind}${state.providerStatus ? ` (${state.providerStatus})` : ''}.`);
if (state.kind === 'ready') {
  const generated = await createTremendousGenerateLinkAdapter(config)(first.reward.rewardId);
  if (!generated.ok || !generated.url.startsWith('https://')) { console.error('Testflight link validation failed.'); Deno.exit(1); }
  console.log('PASS transient HTTPS reward link validated. The secret link was not printed or persisted.');
} else console.log('INFO reward is not ready; generate_link was not called.');
