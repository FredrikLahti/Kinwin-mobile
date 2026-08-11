const expectedRef = 'ywoledppusxwdonwsewh';
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (url !== `https://${expectedRef}.supabase.co` || !anonKey) {
  console.error('Hosted beta verification requires the TEST project URL and its public anon key.');
  process.exit(1);
}

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };
const checks = [];
const check = async (name, run) => {
  try { const detail = await run(); checks.push({ name, ok: true, detail }); }
  catch (error) { checks.push({ name, ok: false, detail: error instanceof Error ? error.message : 'failed' }); }
};
const expectStatus = async (path, init, allowed) => {
  const response = await fetch(`${url}${path}`, init);
  if (!allowed.includes(response.status)) throw new Error(`unexpected HTTP ${response.status}`);
  return `HTTP ${response.status}`;
};
const expectJsonError = async (path, init, status, expectedError) => {
  const response = await fetch(`${url}${path}`, init); const body = await response.json().catch(() => null);
  if (response.status !== status || body?.error !== expectedError) throw new Error(`unexpected HTTP ${response.status} response`);
  return `HTTP ${response.status} ${expectedError}`;
};

await check('GoTrue connectivity', () => expectStatus('/auth/v1/health', { headers: { apikey: anonKey } }, [200]));
for (const table of ['profiles','challenges','challenge_recipients','consequences','invitations','playbook_entries']) {
  await check(`anon cannot read ${table}`, () => expectStatus(`/rest/v1/${table}?select=*&limit=1`, { headers }, [401,403]));
}
await check('private schema not exposed', () => expectStatus('/rest/v1/reward_fulfillment_health?select=*&limit=1', { headers: { ...headers, 'Accept-Profile': 'private' } }, [401,403,404,406]));
await check('invalid invitation token reveals nothing', () => expectJsonError('/functions/v1/recipient-invitation', { method:'POST', headers, body:JSON.stringify({token:'invalid'}) }, 404, 'not_found'));
await check('invalid organizer token reveals nothing', () => expectJsonError('/functions/v1/organizer-reward-link', { method:'POST', headers, body:JSON.stringify({token:'invalid'}) }, 404, 'not_found'));
await check('owner reward RPC rejects anon', () => expectStatus('/rest/v1/rpc/get_owner_reward_progress', { method:'POST', headers, body:JSON.stringify({p_challenge_id:'00000000-0000-0000-0000-000000000000'}) }, [401,403,404]));
const userToken = process.env.BETA_TEST_USER_ACCESS_TOKEN;
if (userToken) await check('owner reward RPC exists for an authenticated TEST user', () => expectStatus('/rest/v1/rpc/get_owner_reward_progress', { method:'POST', headers:{...headers,Authorization:`Bearer ${userToken}`}, body:JSON.stringify({p_challenge_id:'00000000-0000-0000-0000-000000000000'}) }, [200]));
else console.log('SKIP authenticated owner reward RPC probe: BETA_TEST_USER_ACCESS_TOKEN not set.');

for (const fn of ['append-check-in-event','create-consequence-setup-intent','finalize-challenge','create-recipient-invitation','create-organizer-invitation','mark-recipient-invitation-shared']) {
  await check(`${fn} requires a user`, () => expectStatus(`/functions/v1/${fn}`, { method:'POST', headers, body:'{}' }, [401,403]));
}
for (const fn of ['scheduled-finalize-challenges','scheduled-charge-failed-consequences','scheduled-fulfill-rewards','scheduled-reconcile-rewards']) {
  await check(`${fn} requires worker secret`, () => expectStatus(`/functions/v1/${fn}`, { method:'POST', headers, body:'{}' }, [401,403]));
}
await check('Stripe webhook rejects unsigned request', () => expectStatus('/functions/v1/stripe-consequence-webhook', { method:'POST', headers, body:'{}' }, [400,401]));

for (const result of checks) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}: ${result.detail}`);
const failed = checks.filter((result) => !result.ok);
console.log(`Hosted TEST verification: ${checks.length - failed.length}/${checks.length} checks passed. Tremendous order smoke: not run by this command.`);
if (failed.length) process.exit(1);
