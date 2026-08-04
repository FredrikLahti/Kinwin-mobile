/**
 * Real GoTrue + PostgREST end-to-end coverage for
 * `private.generate_challenge_periods` (see
 * supabase/migrations/20260809000000_server_generated_periods.sql) — the
 * layer supabase/tests/run.sh's 130_server_generated_periods.sql (native
 * PostgreSQL, service_role/authenticated impersonated via SET ROLE) cannot
 * reach: real JWT issuance and PostgREST's own schema-exposure handling.
 *
 * The function is deliberately *not* wired to the client and lives in
 * `private`, which PostgREST never exposes (see `supabase/config.toml`'s
 * `api.schemas = ["public", "graphql_public"]` and
 * `050_private_schema_isolation.sql`). This suite proves that holds against
 * a real local stack for both an unauthenticated and a real signed-up
 * GoTrue user — not just that the function lacks an EXECUTE grant, but that
 * PostgREST refuses the request before a grant would even be checked. Run
 * only in CI against a `supabase start` local stack (see
 * .github/workflows/supabase-e2e.yml); never against a hosted project.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_ANON_KEY must be set (from `supabase status -o env` against a running `supabase start`). ' +
      'This suite talks to a real local GoTrue/PostgREST stack and refuses to run without it — no mocked backend.',
  );
}

function freshClient() {
  // No AsyncStorage/persistSession here: this is a one-shot Node process,
  // not the RN app, and each test wants an isolated, explicit session.
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function testEmail(label: string) {
  return `${label}-${randomUUID()}@kinwin-e2e.test`;
}

const PASSWORD = 'correct horse battery staple';

async function signUpAndSignIn(client: ReturnType<typeof freshClient>, email: string) {
  const signUp = await client.auth.signUp({ email, password: PASSWORD });
  assert.equal(signUp.error, null, `signUp failed: ${signUp.error?.message}`);

  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.equal(signIn.error, null, `signInWithPassword failed: ${signIn.error?.message}`);
  assert.ok(signIn.data.session, 'signInWithPassword did not return a session');
}

async function attemptGeneratePeriods(client: ReturnType<typeof freshClient>) {
  return client.schema('private').rpc('generate_challenge_periods', {
    p_challenge_id: randomUUID(),
    p_activation_instant: new Date().toISOString(),
    p_timezone: 'Europe/Stockholm',
  });
}

test('private.generate_challenge_periods stays unreachable over real PostgREST', async (t) => {
  await t.test('an anonymous (signed-out) client cannot reach it', async () => {
    const anon = freshClient();
    const { data, error } = await attemptGeneratePeriods(anon);
    assert.ok(error, 'expected the private schema to be unreachable to an anonymous client');
    assert.equal(data, null);
  });

  await t.test('a real signed-up, signed-in GoTrue user cannot reach it either', async () => {
    const authed = freshClient();
    await signUpAndSignIn(authed, testEmail('periods-owner'));
    const { data, error } = await attemptGeneratePeriods(authed);
    assert.ok(error, 'expected the private schema to be unreachable even to an authenticated client');
    assert.equal(data, null);
  });
});
