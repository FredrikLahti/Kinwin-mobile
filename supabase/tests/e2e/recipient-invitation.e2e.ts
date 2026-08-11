import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !serviceKey) throw new Error('local Supabase environment is required');

const testUrl = url as string;
const anonKey = key as string;
const serviceRoleKey = serviceKey as string;
const client = (k = anonKey) =>
  createClient(testUrl, k, { auth: { autoRefreshToken: false, persistSession: false } });
const password = 'correct horse battery staple';

async function user(label: string) {
  const c = client();
  const email = `recipient-${label}-${randomUUID()}@kinwin-e2e.test`;
  const created = await c.auth.signUp({ email, password });
  assert.equal(created.error, null);
  const signed = await c.auth.signInWithPassword({ email, password });
  assert.ok(signed.data.user);
  return { c, id: signed.data.user!.id };
}

async function recipientCall(token: string, action = 'resolve') {
  return fetch(`${testUrl}/functions/v1/recipient-invitation`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, action }),
  });
}

test('real recipient token boundary is narrow, owner scoped and idempotent', async () => {
  const owner = await user('owner');
  const foreign = await user('foreign');
  const service = client(serviceRoleKey);
  const challenge = randomUUID();
  const recipientA = randomUUID();
  const recipientB = randomUUID();
  const consequence = randomUUID();
  const snapshot = {
    schemaVersion: 1,
    id: challenge,
    ownerId: owner.id,
    ruleEngineVersion: 1,
    goal: 'Feel stronger',
    behavior: { description: 'Run each morning', completionDefinition: 'Complete a run' },
    duration: { unit: 'week', value: 2 },
    successRule: { direction: 'stop', ruleVersion: 1 },
    recipients: [
      { id: recipientA, name: 'Anna' },
      { id: recipientB, name: 'Bo' },
    ],
    rewardOrganizer: { type: 'other', name: 'Alex' },
    consequenceCategory: 'dinner',
    stake: { minorUnits: 5000, currency: 'USD' },
    sitOutAcknowledged: true,
    membershipStatusAtActivation: 'trialing',
  };

  const now = new Date().toISOString();
  assert.equal(
    (
      await service.from('challenges').insert({
        id: challenge,
        owner_id: owner.id,
        schema_version: 1,
        rule_engine_version: 1,
        challenge_status: 'active',
        timezone: 'UTC',
        activated_at: now,
        starts_at: now,
        planned_ends_at: new Date(Date.now() + 86400000).toISOString(),
        activation_snapshot: snapshot,
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await service.from('challenge_recipients').insert([
        { id: recipientA, challenge_id: challenge, display_name: 'Anna', sort_order: 0 },
        { id: recipientB, challenge_id: challenge, display_name: 'Bo', sort_order: 1 },
      ])
    ).error,
    null,
  );
  assert.equal(
    (
      await service.from('consequences').insert({
        id: consequence,
        challenge_id: challenge,
        owner_id: owner.id,
        status: 'active',
        stake_minor_units: 5000,
        currency: 'USD',
      })
    ).error,
    null,
  );

  assert.ok(
    (await foreign.c.functions.invoke('create-recipient-invitation', { body: { recipientId: recipientA } }))
      .error,
  );

  const first = await owner.c.functions.invoke('create-recipient-invitation', {
    body: { recipientId: recipientA },
  });
  assert.equal(first.error, null);
  const tokenA = first.data.token;

  const again = await owner.c.functions.invoke('create-recipient-invitation', {
    body: { recipientId: recipientA },
  });
  assert.equal(again.error, null);
  assert.equal(again.data.invitationId, first.data.invitationId);
  assert.notEqual(again.data.token, tokenA);

  const stored = await service
    .from('invitations')
    .select('token_hash')
    .eq('id', first.data.invitationId)
    .single();
  assert.equal(JSON.stringify(stored.data).includes(again.data.token), false);
  assert.equal(
    (await foreign.c.from('invitations').select('id').eq('id', first.data.invitationId)).data?.length,
    0,
  );

  assert.equal((await recipientCall('x'.repeat(43))).status, 404);
  assert.equal((await recipientCall(tokenA)).status, 404);

  const resolved = await recipientCall(again.data.token);
  assert.equal(resolved.status, 200);
  const projection = (await resolved.json()).invitation;
  assert.deepEqual(
    Object.keys(projection).sort(),
    ['accessRole','behavior','consequenceCategory','goal','organizerName','ownerName','ownerSitsOut','recipientName','recipientNames','redemptionUrl','rewardStatus','status'].sort(),
  );
  assert.equal(projection.recipientName, 'Anna');
  assert.equal(projection.accessRole,'recipient');
  assert.equal(projection.redemptionUrl,null);
  assert.equal(JSON.stringify(projection).includes('5000'), false);

  const accepted = await recipientCall(again.data.token, 'accept');
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).invitation.status, 'accepted');
  assert.equal((await recipientCall(again.data.token, 'accept')).status, 200);
  assert.equal((await recipientCall(again.data.token, 'decline')).status, 409);

  const second = await owner.c.functions.invoke('create-recipient-invitation', {
    body: { recipientId: recipientB },
  });
  assert.equal(second.error, null);
  const resolvedB = await recipientCall(second.data.token);
  assert.equal((await resolvedB.json()).invitation.recipientName, 'Bo');
  assert.equal((await recipientCall(second.data.token, 'decline')).status, 200);
  assert.equal((await recipientCall(second.data.token, 'decline')).status, 200);
  assert.equal((await recipientCall(second.data.token, 'accept')).status, 409);

  const canonical=await service.from('challenge_reward_organizers').select('id, organizer_kind, challenge_recipient_id').eq('challenge_id',challenge).single();
  assert.equal(canonical.data?.organizer_kind,'other');assert.equal(canonical.data?.challenge_recipient_id,null);
  assert.ok((await foreign.c.functions.invoke('create-organizer-invitation',{body:{organizerId:canonical.data!.id}})).error);
  const organizerInvite=await owner.c.functions.invoke('create-organizer-invitation',{body:{organizerId:canonical.data!.id}});assert.equal(organizerInvite.error,null);
  const organizerStored=await service.from('invitations').select('token_hash').eq('id',organizerInvite.data.invitationId).single();assert.equal(JSON.stringify(organizerStored.data).includes(organizerInvite.data.token),false);
  const organizerResolved=await recipientCall(organizerInvite.data.token);assert.equal(organizerResolved.status,200);const organizerProjection=(await organizerResolved.json()).invitation;assert.equal(organizerProjection.accessRole,'organizer');assert.equal(organizerProjection.organizerName,'Alex');assert.deepEqual(organizerProjection.recipientNames,['Anna','Bo']);
  assert.equal((await recipientCall(organizerInvite.data.token,'accept')).status,200);assert.equal((await recipientCall(organizerInvite.data.token,'accept')).status,200);

  assert.equal(
    (
      await service
        .from('kin_connections')
        .select('id')
        .or(`requester_id.eq.${owner.id},recipient_id.eq.${owner.id}`)
    ).data?.length,
    0,
  );
  assert.equal(
    (await service.from('social_activity').select('id').eq('owner_id', owner.id)).data?.length,
    0,
  );
  assert.equal(
    (await service.from('playbook_entries').select('id').eq('owner_id', owner.id)).data?.length,
    0,
  );
  assert.equal(
    (await service.from('challenges').select('challenge_status').eq('id', challenge).single()).data
      ?.challenge_status,
    'active',
  );

  const unchangedConsequence = await service
    .from('consequences')
    .select('status, stake_minor_units')
    .eq('id', consequence)
    .single();
  assert.deepEqual(unchangedConsequence.data, { status: 'active', stake_minor_units: 5000 });

  // The local PostgREST config intentionally exposes only public/graphql_public.
  // Data-level assertions for these private objects live in the SQL suite; the
  // real HTTP suite should prove that even service credentials cannot route to
  // the private schema through PostgREST by accident.
  const privateChargeProbe = await service
    .schema('private')
    .from('consequence_charge_attempts')
    .select('id')
    .eq('consequence_id', consequence);
  assert.ok(privateChargeProbe.error, 'private charge attempts unexpectedly exposed through PostgREST');

  const privateDeliveryProbe = await service
    .schema('private')
    .from('accepted_reward_organizer_targets')
    .select('recipient_id')
    .eq('invitation_id', first.data.invitationId);
  assert.ok(privateDeliveryProbe.error, 'private delivery targets unexpectedly exposed through PostgREST');

  const anon = client();
  for (const table of [
    'challenges',
    'challenge_recipients',
    'consequences',
    'check_in_events',
    'profiles',
    'invitations',
    'playbook_entries',
  ]) {
    assert.ok((await anon.from(table).select('*').limit(1)).error, `${table} unexpectedly readable by anon`);
  }
});
