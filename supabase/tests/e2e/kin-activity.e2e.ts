/**
 * Real GoTrue + PostgREST end-to-end coverage for the Kin activity feed's
 * self-exclusion (lib/supabase/kin-repository.ts's fetchKinActivity):
 * proves the query it runs against `social_activity` excludes the caller's
 * own rows while still returning an accepted Kin's, and — separately —
 * that RLS alone does NOT exclude the caller's own rows, so this really is
 * an application-layer filter this test can regress, not something RLS
 * already guaranteed for free. Every consumer of this feed (Home's "From
 * your Kin" module, the Kin tab's Activity list) is specifically about
 * what a Kin did, never a combined "me + Kin" timeline — see both
 * screens' own comments and docs/PRODUCT_DECISIONS.md's social section.
 *
 * Does not import lib/supabase/kin-repository.ts directly: every other
 * e2e test in this directory (see playbook.e2e.ts) runs the equivalent
 * PostgREST query inline instead, since the app's own `supabase` client is
 * a single shared singleton that cannot be re-authenticated as multiple
 * per-user clients within one test process. The query below is written to
 * match fetchKinActivity's exactly (same table, same select, same
 * `.neq('owner_id', ...)` — see that function's own comment).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_DB_URL) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_DB_URL (all from `supabase status -o env` ' +
      'against a running `supabase start`) must be set. This suite talks to a real local GoTrue/PostgREST stack and ' +
      'refuses to run without it — no mocked backend.',
  );
}

/** Direct SQL against the real local Postgres — social_activity and kin_connections rows this test needs are never client-insertable (server/trigger-only writes; see 20260815000000_social_activity.sql and 20260814000000_kin_connections.sql), so fixtures go in as service-role SQL, the same pattern account-deletion.e2e.ts uses for tables the client can't write to. */
function runFixtureSql(sql: string): void {
  execFileSync('psql', [SUPABASE_DB_URL as string, '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

function freshClient() {
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function testEmail(label: string) {
  return `${label}-${randomUUID()}@kinwin-e2e.test`;
}

const PASSWORD = 'correct horse battery staple';

async function signUpAndSignIn(email: string) {
  const client = freshClient();
  const signUp = await client.auth.signUp({ email, password: PASSWORD });
  assert.equal(signUp.error, null, `signUp failed: ${signUp.error?.message}`);
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.equal(signIn.error, null, `signInWithPassword failed: ${signIn.error?.message}`);
  assert.ok(signIn.data.session, 'signInWithPassword did not return a session');
  return { client, userId: signIn.data.session!.user.id };
}

test('Kin activity feed: excludes the caller\'s own activity, includes an accepted Kin\'s', async () => {
  const owner = await signUpAndSignIn(testEmail('kin-activity-owner'));
  const kin = await signUpAndSignIn(testEmail('kin-activity-kin'));

  runFixtureSql(`
    insert into public.kin_connections (requester_id, recipient_id, status)
    values ('${owner.userId}', '${kin.userId}', 'accepted');
  `);

  const ownerActivityId = randomUUID();
  const kinActivityId = randomUUID();
  runFixtureSql(`
    insert into public.social_activity (id, owner_id, kind, payload, dedupe_key)
    values
      ('${ownerActivityId}', '${owner.userId}', 'challenge_started', '{"behavior":{}}'::jsonb, 'owner-${randomUUID()}'),
      ('${kinActivityId}', '${kin.userId}', 'challenge_started', '{"behavior":{}}'::jsonb, 'kin-${randomUUID()}');
  `);

  // RLS alone (own activity plus accepted Kin's) does NOT exclude the
  // caller's own row — proves the exclusion this test guards is a real
  // application-layer filter, not something RLS already gave for free.
  const unfiltered = await owner.client.from('social_activity').select('id, owner_id');
  assert.equal(unfiltered.error, null);
  assert.ok(
    unfiltered.data?.some((row) => row.id === ownerActivityId),
    'expected RLS alone to still permit the caller to see their own social_activity row',
  );

  // The actual query fetchKinActivity runs: same table, same select shape,
  // same `.neq('owner_id', userId)` this fix added.
  const kinOnly = await owner.client
    .from('social_activity')
    .select('id, owner_id')
    .neq('owner_id', owner.userId)
    .order('created_at', { ascending: false });
  assert.equal(kinOnly.error, null);
  const ids = (kinOnly.data ?? []).map((row) => row.id);
  assert.ok(!ids.includes(ownerActivityId), 'expected the caller\'s own activity to be excluded');
  assert.ok(ids.includes(kinActivityId), 'expected the accepted Kin\'s activity to still be included');
});
