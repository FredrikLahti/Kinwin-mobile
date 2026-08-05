-- Trusted server-side foundation for saving a consequence payment method
-- with Stripe, in test mode, for future off-session charging. This package
-- is backend-only: it does not implement PaymentSheet, memberships,
-- charging, final activation, or check-ins.
--
-- Reuses the existing `public.consequences` and
-- `private.consequence_provider_references` — no competing consequence
-- model. Only adds what a durable Stripe setup attempt, webhook
-- idempotency, and one Stripe Customer per owner genuinely require.
--
-- Three trusted, service-role-only RPCs do all database writes for this
-- flow. Postgres cannot call the Stripe API itself, so the Edge Functions in
-- supabase/functions/ call Stripe between the first two, never writing
-- challenge/consequence state directly from application code. Unlike
-- 20260809000000_server_generated_periods.sql's private-schema function
-- (called only from a future trusted SQL transaction), these three are
-- called over PostgREST by an Edge Function using the service-role key —
-- which only works for functions in an exposed schema — so they live in
-- `public` with grants restricted to `service_role`, not in `private`. See
-- the comment above the grant statements at the end of this file.

-- Lets `private.consequence_setup_attempts` (and similar future tables)
-- carry an owner_id that is verified, at the database level, to actually
-- belong to the referenced consequence — the same composite-FK pattern
-- `challenges (id, owner_id)` already established for `check_in_events`
-- and `invitations`.
alter table public.consequences add constraint consequences_id_owner_key unique (id, owner_id);

-- One Stripe Customer per Kinwin owner. `stripe_customer_id` is unique so
-- two owners can never be conflated onto the same Stripe Customer.
create table private.stripe_customers (
  owner_id uuid primary key references auth.users (id) on delete restrict,
  stripe_customer_id text not null unique check (length(btrim(stripe_customer_id)) > 0),
  created_at timestamptz not null default now()
);

-- Durable history of every SetupIntent attempt, one row per Stripe
-- SetupIntent. `status` mirrors what Stripe told us via the webhook
-- ('pending' until a terminal webhook event arrives); `superseded` marks an
-- attempt that resolved after a newer attempt for the same consequence had
-- already taken over. Never exposed to any client role.
create table private.consequence_setup_attempts (
  id uuid primary key default gen_random_uuid(),
  -- Strictly monotonic creation order. `created_at` alone is not reliable
  -- for "which attempt is latest": `now()` returns transaction start time,
  -- so two attempts created in the same transaction (or the same
  -- statement-timestamp window under load) would tie. This identity column
  -- is gap-tolerant but never ties, which is all "latest" needs.
  sequence_number bigint generated always as identity,
  consequence_id uuid not null,
  owner_id uuid not null,
  stripe_customer_id text not null check (length(btrim(stripe_customer_id)) > 0),
  stripe_setup_intent_id text not null unique check (length(btrim(stripe_setup_intent_id)) > 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'canceled', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (consequence_id, owner_id) references public.consequences (id, owner_id) on delete restrict
);

create index consequence_setup_attempts_consequence_idx
  on private.consequence_setup_attempts (consequence_id, sequence_number desc);

-- Idempotency ledger keyed by Stripe's own event id: every webhook delivery
-- is applied at most once, including Stripe's own automatic retries of the
-- same event.
create table private.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique check (length(btrim(stripe_event_id)) > 0),
  event_type text not null check (length(btrim(event_type)) > 0),
  processed_at timestamptz not null default now()
);

create trigger consequence_setup_attempts_set_updated_at before update on private.consequence_setup_attempts
  for each row execute function public.set_updated_at();

-- Step 1 of 2 for creating a setup attempt: pure validation and read. Called
-- before the Edge Function talks to Stripe, so a rejected/foreign/non-pending
-- commitment never causes a Stripe Customer or SetupIntent to be created at
-- all. Returns any already-known Stripe Customer id (reuse) and any still-
-- pending setup attempt for this consequence (so the Edge Function can
-- retrieve — never re-create — its SetupIntent instead of making a new one).
create function public.prepare_consequence_setup(
  p_owner_id uuid,
  p_challenge_id uuid default null,
  p_consequence_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
  v_consequence public.consequences%rowtype;
  v_existing_customer_id text;
  v_reusable_attempt_id uuid;
  v_reusable_setup_intent_id text;
begin
  if p_owner_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_challenge_id is null and p_consequence_id is null then
    raise exception 'a challenge or consequence id is required' using errcode = '22023';
  end if;

  if p_consequence_id is not null then
    select * into v_consequence from public.consequences where id = p_consequence_id and owner_id = p_owner_id;
    if not found then
      raise exception 'commitment not found' using errcode = 'P0002';
    end if;
    select * into v_challenge from public.challenges where id = v_consequence.challenge_id and owner_id = p_owner_id;
    if not found then
      raise exception 'commitment not found' using errcode = 'P0002';
    end if;
  else
    select * into v_challenge from public.challenges where id = p_challenge_id and owner_id = p_owner_id;
    if not found then
      raise exception 'commitment not found' using errcode = 'P0002';
    end if;
    select * into v_consequence from public.consequences where challenge_id = v_challenge.id and owner_id = p_owner_id;
    if not found then
      raise exception 'commitment not found' using errcode = 'P0002';
    end if;
  end if;

  if v_challenge.challenge_status <> 'pending_activation' then
    raise exception 'challenge is not pending activation' using errcode = '22023';
  end if;

  select stripe_customer_id into v_existing_customer_id
    from private.stripe_customers where owner_id = p_owner_id;

  select id, stripe_setup_intent_id into v_reusable_attempt_id, v_reusable_setup_intent_id
    from private.consequence_setup_attempts
    where consequence_id = v_consequence.id and status = 'pending'
    order by sequence_number desc
    limit 1;

  return jsonb_build_object(
    'challengeId', v_challenge.id,
    'consequenceId', v_consequence.id,
    'existingStripeCustomerId', v_existing_customer_id,
    'reusableSetupAttemptId', v_reusable_attempt_id,
    'reusableStripeSetupIntentId', v_reusable_setup_intent_id
  );
end;
$$;

-- Step 2 of 2: called after the Edge Function has created (or reused) a
-- Stripe Customer and a new SetupIntent. Re-validates ownership and status
-- from scratch — state may have changed since step 1 — and atomically
-- records the Customer (first writer wins; a concurrent caller's Stripe
-- idempotency key already guarantees they resolved to the very same
-- Customer id, so a lost race here is harmless) and the new setup attempt.
-- Never marks the consequence authorized itself — only a verified webhook
-- event does that.
create function public.record_consequence_setup_attempt(
  p_owner_id uuid,
  p_challenge_id uuid,
  p_stripe_customer_id text,
  p_stripe_setup_intent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
  v_consequence public.consequences%rowtype;
  v_attempt_id uuid;
begin
  if p_owner_id is null or p_challenge_id is null then
    raise exception 'authentication and challenge id are required' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_stripe_customer_id)), 0) = 0 or coalesce(length(btrim(p_stripe_setup_intent_id)), 0) = 0 then
    raise exception 'stripe customer and setup intent ids are required' using errcode = '22023';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id and owner_id = p_owner_id for update;
  if not found then
    raise exception 'commitment not found' using errcode = 'P0002';
  end if;
  if v_challenge.challenge_status <> 'pending_activation' then
    raise exception 'challenge is not pending activation' using errcode = '22023';
  end if;

  select * into v_consequence from public.consequences where challenge_id = v_challenge.id and owner_id = p_owner_id for update;
  if not found then
    raise exception 'commitment not found' using errcode = 'P0002';
  end if;

  insert into private.stripe_customers (owner_id, stripe_customer_id)
    values (p_owner_id, p_stripe_customer_id)
    on conflict (owner_id) do nothing;

  begin
    insert into private.consequence_setup_attempts (
      id, consequence_id, owner_id, stripe_customer_id, stripe_setup_intent_id, status
    ) values (
      gen_random_uuid(), v_consequence.id, p_owner_id, p_stripe_customer_id, p_stripe_setup_intent_id, 'pending'
    ) returning id into v_attempt_id;
  exception when unique_violation then
    -- A repeated call for the very same SetupIntent (e.g. an Edge Function
    -- retry after a lost response) returns the attempt already on record
    -- instead of erroring or duplicating it.
    select id into v_attempt_id from private.consequence_setup_attempts
      where stripe_setup_intent_id = p_stripe_setup_intent_id;
  end;

  -- Never downgrades an already-`authorized` consequence: a replacement
  -- attempt in progress must not make a currently-valid payment method look
  -- unset while it is still the honest current state.
  if v_consequence.authorization_status in ('not_requested', 'failed') then
    update public.consequences set authorization_status = 'pending' where id = v_consequence.id;
  end if;

  return jsonb_build_object('setupAttemptId', v_attempt_id, 'consequenceId', v_consequence.id);
end;
$$;

-- Applies one verified, signature-checked Stripe webhook event. The Edge
-- Function is responsible for signature verification before ever calling
-- this — this function trusts its inputs as already-verified Stripe data,
-- the same trust boundary GoTrue-issued JWTs already get elsewhere in this
-- schema.
create function public.apply_consequence_setup_event(
  p_stripe_event_id text,
  p_event_type text,
  p_stripe_setup_intent_id text,
  p_stripe_customer_id text,
  p_stripe_payment_method_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_row_id uuid;
  v_attempt private.consequence_setup_attempts%rowtype;
  v_latest_attempt_id uuid;
  v_consequence public.consequences%rowtype;
  v_challenge public.challenges%rowtype;
  v_outcome text;
begin
  if coalesce(length(btrim(p_stripe_event_id)), 0) = 0 or coalesce(length(btrim(p_stripe_setup_intent_id)), 0) = 0 then
    raise exception 'stripe event id and setup intent id are required' using errcode = '22023';
  end if;
  if p_status not in ('succeeded', 'failed', 'canceled') then
    raise exception 'unsupported status: %', p_status using errcode = '22023';
  end if;

  -- Idempotency first, before anything else is read or written: a
  -- duplicate delivery of an already-processed event id no-ops here,
  -- covering Stripe's own automatic retries.
  insert into private.stripe_webhook_events (id, stripe_event_id, event_type)
    values (gen_random_uuid(), p_stripe_event_id, p_event_type)
    on conflict (stripe_event_id) do nothing
    returning id into v_event_row_id;
  if v_event_row_id is null then
    return jsonb_build_object('outcome', 'duplicate_event');
  end if;

  select * into v_attempt from private.consequence_setup_attempts
    where stripe_setup_intent_id = p_stripe_setup_intent_id
    for update;
  if not found then
    -- Not a SetupIntent this system ever created (or a stale/foreign
    -- object). The event is already recorded as processed above; there is
    -- nothing else to safely do with it.
    return jsonb_build_object('outcome', 'unknown_setup_intent');
  end if;

  if v_attempt.stripe_customer_id <> p_stripe_customer_id then
    -- Defense in depth: the Stripe object's own customer must match what
    -- was recorded when this attempt was created.
    return jsonb_build_object('outcome', 'customer_mismatch');
  end if;

  select * into v_consequence from public.consequences where id = v_attempt.consequence_id for update;
  select * into v_challenge from public.challenges where id = v_consequence.challenge_id for update;

  -- Superseded guard: only the most recently created attempt for this
  -- consequence may ever move the shared authorization state. An older
  -- attempt's late-arriving event still gets its own row updated (honest
  -- history) but never touches consequences/provider_references.
  select id into v_latest_attempt_id from private.consequence_setup_attempts
    where consequence_id = v_attempt.consequence_id
    order by sequence_number desc
    limit 1;

  if v_latest_attempt_id is distinct from v_attempt.id then
    update private.consequence_setup_attempts set status = p_status where id = v_attempt.id;
    return jsonb_build_object('outcome', 'superseded', 'setupAttemptId', v_attempt.id);
  end if;

  -- Cancellation guard: a late webhook can never (re)authorize a commitment
  -- that is no longer pending_activation.
  if v_challenge.challenge_status <> 'pending_activation' then
    update private.consequence_setup_attempts set status = p_status where id = v_attempt.id;
    return jsonb_build_object('outcome', 'commitment_not_pending', 'setupAttemptId', v_attempt.id);
  end if;

  update private.consequence_setup_attempts set status = p_status where id = v_attempt.id;

  if p_status = 'succeeded' then
    insert into private.consequence_provider_references (
      consequence_id, payment_provider, customer_reference, payment_method_reference, authorization_reference
    ) values (
      v_consequence.id, 'stripe', p_stripe_customer_id, p_stripe_payment_method_id, p_stripe_setup_intent_id
    )
    on conflict (consequence_id) do update set
      payment_provider = excluded.payment_provider,
      customer_reference = excluded.customer_reference,
      payment_method_reference = excluded.payment_method_reference,
      authorization_reference = excluded.authorization_reference,
      updated_at = now();

    update public.consequences
      set authorization_status = 'authorized',
        authorized_at = now(),
        status = case when status = 'payment_method_required' then 'authorized' else status end
      where id = v_consequence.id;

    v_outcome := 'authorized';
  else
    -- failed / canceled: an already-authorized method is preserved exactly
    -- as it is (no detach, no downgrade) — only reflect the failure at the
    -- consequence level when there was no prior successful authorization.
    if v_consequence.authorization_status <> 'authorized' then
      update public.consequences set authorization_status = 'failed' where id = v_consequence.id;
    end if;
    v_outcome := p_status;
  end if;

  return jsonb_build_object('outcome', v_outcome, 'setupAttemptId', v_attempt.id, 'consequenceId', v_consequence.id);
end;
$$;

-- These three live in `public`, not `private`: PostgREST (and therefore any
-- Edge Function calling them via the service-role Supabase client's
-- `.rpc()`) can only reach functions in an exposed schema — `private` is
-- deliberately not one (see 050_private_schema_isolation.sql). Living in
-- `public` does not make them reachable by anon/authenticated: no EXECUTE
-- grant exists for either role, only for `service_role`, the same
-- grant-restriction pattern `public.prepare_challenge_from_draft` and
-- `public.cancel_pending_challenge` already use (there restricted to
-- `authenticated` instead, since those are called directly by the client).
-- The tables these functions read and write stay in `private` — being
-- `security definer`, they can reach those regardless of the caller's own
-- grants, so no client role gains any new access to `private` itself.
revoke all on function public.prepare_consequence_setup(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_consequence_setup_attempt(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.apply_consequence_setup_event(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.prepare_consequence_setup(uuid, uuid, uuid) to service_role;
grant execute on function public.record_consequence_setup_attempt(uuid, uuid, text, text) to service_role;
grant execute on function public.apply_consequence_setup_event(text, text, text, text, text, text) to service_role;

grant select, insert on table private.stripe_customers to service_role;
grant select, insert, update on table private.consequence_setup_attempts to service_role;
grant select, insert on table private.stripe_webhook_events to service_role;
