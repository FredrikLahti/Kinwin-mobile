-- External-beta UX polish: gives the owner a safe, coarse read of whether a
-- failed-challenge consequence payment needs their attention, and extends
-- the existing narrow card-replacement recovery mechanism (see
-- 20260823000000_stripe_failure_charging.sql) to also cover the terminal
-- 'permanently_failed' outcome (automatic retries exhausted). This does not
-- change the payment worker's cadence, backoff, idempotency keys, or the
-- charge/PaymentIntent logic itself — only which charge-attempt states are
-- eligible for the owner to replace their payment method, and resets the
-- retry counter on a genuine card replacement so a fresh card gets the same
-- three-attempt allowance a first attempt gets. See docs/PRODUCT_STATUS.md
-- and docs/LAUNCH_READINESS.md for the product context.

-- 1) Widen recovery eligibility to also include the exhausted-retries state.
create or replace function public.prepare_consequence_recovery_setup(p_owner_id uuid,p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.challenges%rowtype; co public.consequences%rowtype; a private.consequence_charge_attempts%rowtype; customer text;
begin
 select * into c from public.challenges where id=p_challenge_id and owner_id=p_owner_id;
 if not found then raise exception 'commitment not found' using errcode='P0002'; end if;
 select * into co from public.consequences where challenge_id=c.id;
 select * into a from private.consequence_charge_attempts where consequence_id=co.id;
 if c.challenge_status<>'completed_failure' or a.status not in ('requires_payment_method','requires_action','permanently_failed') then raise exception 'payment recovery is not available' using errcode='22023'; end if;
 select stripe_customer_id into customer from private.stripe_customers where owner_id=p_owner_id;
 return jsonb_build_object('challengeId',c.id,'consequenceId',co.id,'existingStripeCustomerId',customer,'reusableSetupAttemptId',null,'reusableStripeSetupIntentId',null);
end $$;

create or replace function public.record_consequence_recovery_setup_attempt(p_owner_id uuid,p_challenge_id uuid,p_stripe_customer_id text,p_stripe_setup_intent_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_co public.consequences%rowtype;a private.consequence_charge_attempts%rowtype;attempt uuid;
begin
 select co.* into v_co from public.consequences co join public.challenges c on c.id=co.challenge_id where c.id=p_challenge_id and c.owner_id=p_owner_id and c.challenge_status='completed_failure' for update of co;
 if not found then raise exception 'commitment not found' using errcode='P0002'; end if;
 select * into a from private.consequence_charge_attempts where consequence_id=v_co.id;
 if a.status not in ('requires_payment_method','requires_action','permanently_failed') or a.stripe_customer_id<>p_stripe_customer_id then raise exception 'payment recovery is not available' using errcode='22023'; end if;
 insert into private.consequence_setup_attempts(consequence_id,owner_id,stripe_customer_id,stripe_setup_intent_id,status) values(v_co.id,p_owner_id,p_stripe_customer_id,p_stripe_setup_intent_id,'pending') returning id into attempt;
 return jsonb_build_object('setupAttemptId',attempt,'consequenceId',v_co.id);
end $$;

create or replace function public.apply_consequence_recovery_setup_event(p_stripe_setup_intent_id text,p_stripe_customer_id text,p_stripe_payment_method_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.consequence_setup_attempts%rowtype;a private.consequence_charge_attempts%rowtype;c public.challenges%rowtype;
begin
 select * into s from private.consequence_setup_attempts where stripe_setup_intent_id=p_stripe_setup_intent_id and status='succeeded';
 if not found then return jsonb_build_object('outcome','not_recovery'); end if;
 select * into a from private.consequence_charge_attempts where consequence_id=s.consequence_id for update;
 select c.* into c from public.challenges c join public.consequences co on co.challenge_id=c.id where co.id=s.consequence_id;
 if c.challenge_status<>'completed_failure' or a.status not in ('requires_payment_method','requires_action','permanently_failed') or a.stripe_customer_id<>p_stripe_customer_id then return jsonb_build_object('outcome','not_recoverable'); end if;
 update private.consequence_provider_references set payment_method_reference=p_stripe_payment_method_id,authorization_reference=p_stripe_setup_intent_id where consequence_id=s.consequence_id and customer_reference=p_stripe_customer_id;
 return jsonb_build_object('outcome','payment_method_replaced','obligationId',a.id);
end $$;

-- 2) The worker's own revival step (inside claim_due_consequence_payments)
-- must also recognize a replaced card on a 'permanently_failed' obligation,
-- and must reset retry_count so the fresh card gets a full new attempt
-- allowance instead of remaining permanently unclaimable at retry_count=3.
create or replace function public.claim_due_consequence_payments(p_run_id uuid,p_lease_token uuid,p_limit integer default 25)
returns table(obligation_id uuid,challenge_id uuid,owner_id uuid,amount_minor_units bigint,currency text,
 stripe_customer_id text,stripe_payment_method_id text,stripe_payment_intent_id text,retry_count integer)
language plpgsql security definer set search_path='' as $$
begin
  if p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100' using errcode='22023'; end if;
  if not exists(select 1 from private.consequence_payment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token and locked_until>clock_timestamp()) then
    raise exception 'worker lease is not valid' using errcode='28000';
  end if;
  insert into private.consequence_charge_attempts(id,consequence_id,owner_id,idempotency_key,attempt_number,status,
    amount_minor_units,currency,stripe_customer_id,stripe_payment_method_id,requested_at)
  select gen_random_uuid(),co.id,co.owner_id,'kinwin-failure-obligation:'||c.id,1,'pending',co.stake_minor_units,
    co.currency,pr.customer_reference,pr.payment_method_reference,clock_timestamp()
  from public.challenges c join public.consequences co on co.challenge_id=c.id
  join private.consequence_provider_references pr on pr.consequence_id=co.id and pr.payment_provider='stripe'
  where c.challenge_status='completed_failure' and co.authorization_status='authorized'
    and pr.customer_reference is not null and pr.payment_method_reference is not null
  on conflict(consequence_id) do nothing;

  -- A newly saved replacement method revives the obligation; amount and
  -- PaymentIntent identity are retained. The worker updates that one Intent.
  -- retry_count is reset here so a replaced card always gets a fresh
  -- allowance of attempts, whether it was stuck at requires_payment_method
  -- or had already exhausted its three automatic retries.
  update private.consequence_charge_attempts a set stripe_payment_method_id=pr.payment_method_reference,
    status='temporary_failure',retry_count=0,next_retry_at=clock_timestamp(),failure_code='payment_method_replaced'
  from private.consequence_provider_references pr
  where a.consequence_id=pr.consequence_id and a.status in ('requires_payment_method','permanently_failed')
    and pr.payment_method_reference is distinct from a.stripe_payment_method_id;

  return query
  with due as (
    select a.id from private.consequence_charge_attempts a join public.consequences co on co.id=a.consequence_id
    join public.challenges c on c.id=co.challenge_id
    where c.challenge_status='completed_failure' and a.status in ('pending','temporary_failure')
      and a.retry_count<3 and (a.next_retry_at is null or a.next_retry_at<=clock_timestamp())
    order by co.created_at,a.id limit p_limit for update of a skip locked
  ), claimed as (
    update private.consequence_charge_attempts a set status='processing',last_attempted_at=clock_timestamp(),
      retry_count=a.retry_count+1,next_retry_at=null,failure_code=null,failure_message=null
    from due where a.id=due.id returning a.*
  ) select a.id,co.challenge_id,a.owner_id,a.amount_minor_units,a.currency,a.stripe_customer_id,
      a.stripe_payment_method_id,a.stripe_payment_intent_id,a.retry_count
    from claimed a join public.consequences co on co.id=a.consequence_id;
end $$;

-- 3) Safe, coarse, owner-scoped read of whether a failed-challenge payment
-- needs the owner's attention — never exposes provider ids, raw Stripe
-- status strings, or internal failure codes. Mirrors
-- get_owner_reward_progress's auth.uid()-scoped pattern.
create function public.get_owner_payment_status(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.consequence_charge_attempts%rowtype; found_challenge boolean;
begin
  select exists(
    select 1 from public.challenges where id=p_challenge_id and owner_id=auth.uid() and challenge_status='completed_failure'
  ) into found_challenge;
  if not found_challenge then return jsonb_build_object('state','not_applicable'); end if;
  select a2.* into a from private.consequence_charge_attempts a2
    join public.consequences co on co.id=a2.consequence_id
    where co.challenge_id=p_challenge_id;
  if not found then return jsonb_build_object('state','not_applicable'); end if;
  return jsonb_build_object('state', case
    when a.status='succeeded' then 'paid'
    when a.status in ('requires_payment_method','requires_action','permanently_failed') then 'needs_attention'
    else 'processing' end);
end $$;
revoke all on function public.get_owner_payment_status(uuid) from public,anon;
grant execute on function public.get_owner_payment_status(uuid) to authenticated;
