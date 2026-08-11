-- Server-side Stripe failure charging. Challenge truth is already final before
-- this package runs; payment can never influence challenge_status.

alter table private.consequence_charge_attempts
  add column owner_id uuid references auth.users(id) on delete restrict,
  add column stripe_customer_id text,
  add column stripe_payment_method_id text,
  add column stripe_payment_intent_id text,
  add column retry_count integer not null default 0 check (retry_count between 0 and 3),
  add column next_retry_at timestamptz,
  add column last_attempted_at timestamptz,
  add column customer_action_required boolean not null default false,
  add column updated_at timestamptz not null default now();

-- The table predates charging and should be empty. This defensive backfill
-- nevertheless makes a partially exercised development database migratable
-- without weakening the new ownership/customer invariants.
update private.consequence_charge_attempts a set
  owner_id=co.owner_id,
  stripe_customer_id=pr.customer_reference,
  stripe_payment_method_id=pr.payment_method_reference
from public.consequences co join private.consequence_provider_references pr on pr.consequence_id=co.id
where a.consequence_id=co.id and a.owner_id is null;

alter table private.consequence_charge_attempts drop constraint consequence_charge_attempts_status_check;
alter table private.consequence_charge_attempts add constraint consequence_charge_attempts_status_check
  check (status in ('pending','processing','succeeded','temporary_failure','requires_action','requires_payment_method','permanently_failed','canceled'));
alter table private.consequence_charge_attempts
  add constraint consequence_charge_attempts_one_obligation unique (consequence_id),
  add constraint consequence_charge_attempts_payment_intent_unique unique (stripe_payment_intent_id),
  add constraint consequence_charge_attempts_owner_required check (owner_id is not null),
  add constraint consequence_charge_attempts_customer_required check (length(btrim(stripe_customer_id)) > 0),
  add constraint consequence_charge_attempts_method_required check (length(btrim(stripe_payment_method_id)) > 0),
  add constraint consequence_charge_attempts_action_consistent check (customer_action_required = (status = 'requires_action'));

create trigger consequence_charge_attempts_set_updated_at before update on private.consequence_charge_attempts
  for each row execute function public.set_updated_at();
create index consequence_charge_attempts_due_idx on private.consequence_charge_attempts(next_retry_at)
  where status in ('pending','temporary_failure','requires_payment_method');

create table private.consequence_payment_worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','succeeded','partial_failure','failed')),
  eligible_count integer not null default 0,
  attempted_count integer not null default 0,
  failed_count integer not null default 0,
  error_code text
);
create table private.consequence_payment_worker_lease (
  singleton boolean primary key default true check (singleton),
  run_id uuid references private.consequence_payment_worker_runs(id),
  lease_token uuid,
  locked_until timestamptz,
  check ((run_id is null and lease_token is null and locked_until is null) or
         (run_id is not null and lease_token is not null and locked_until is not null))
);
insert into private.consequence_payment_worker_lease(singleton) values (true);

alter table private.consequence_charge_attempts enable row level security;
alter table private.consequence_payment_worker_runs enable row level security;
alter table private.consequence_payment_worker_lease enable row level security;
revoke all on private.consequence_charge_attempts, private.consequence_payment_worker_runs,
  private.consequence_payment_worker_lease from public, anon, authenticated;
grant select, insert, update on private.consequence_charge_attempts, private.consequence_payment_worker_runs to service_role;
grant select, update on private.consequence_payment_worker_lease to service_role;

create function public.start_consequence_payment_worker() returns jsonb language plpgsql security definer set search_path='' as $$
declare v private.consequence_payment_worker_lease%rowtype; r uuid; t uuid;
begin
  select * into v from private.consequence_payment_worker_lease where singleton for update;
  if v.locked_until > clock_timestamp() then return jsonb_build_object('status','already_running','runId',v.run_id); end if;
  if v.run_id is not null then update private.consequence_payment_worker_runs set status='failed',finished_at=clock_timestamp(),error_code='lease_expired' where id=v.run_id and status='running'; end if;
  insert into private.consequence_payment_worker_runs default values returning id into r; t:=gen_random_uuid();
  update private.consequence_payment_worker_lease set run_id=r,lease_token=t,locked_until=clock_timestamp()+interval '20 minutes' where singleton;
  return jsonb_build_object('status','started','runId',r,'leaseToken',t);
end $$;

-- Creates exactly one obligation from immutable consequence data, then claims
-- it. No caller supplies an owner, amount, currency, Customer or PaymentMethod.
create function public.claim_due_consequence_payments(p_run_id uuid,p_lease_token uuid,p_limit integer default 25)
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

  -- A newly saved replacement method revives the same obligation; amount and
  -- PaymentIntent identity are retained. The worker updates that one Intent.
  update private.consequence_charge_attempts a set stripe_payment_method_id=pr.payment_method_reference,
    status='temporary_failure',next_retry_at=clock_timestamp(),failure_code='payment_method_replaced'
  from private.consequence_provider_references pr
  where a.consequence_id=pr.consequence_id and a.status='requires_payment_method'
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

create function public.record_consequence_payment_intent(p_obligation_id uuid,p_run_id uuid,p_lease_token uuid,
 p_stripe_payment_intent_id text,p_status text,p_failure_category text default null)
returns void language plpgsql security definer set search_path='' as $$
declare a private.consequence_charge_attempts%rowtype;
begin
 if not exists(select 1 from private.consequence_payment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token) then raise exception 'worker lease is not valid' using errcode='28000'; end if;
 if p_status not in ('processing','temporary_failure','requires_action','requires_payment_method','permanently_failed') then raise exception 'invalid payment status' using errcode='22023'; end if;
 select * into a from private.consequence_charge_attempts where id=p_obligation_id for update;
 if not found or a.status='succeeded' then return; end if;
 if a.stripe_payment_intent_id is not null and p_stripe_payment_intent_id is not null and a.stripe_payment_intent_id<>p_stripe_payment_intent_id then raise exception 'payment intent is immutable' using errcode='23000'; end if;
 update private.consequence_charge_attempts set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_stripe_payment_intent_id),
   status=case when p_status='temporary_failure' and retry_count>=3 then 'permanently_failed' else p_status end,
   failure_code=case when p_status='temporary_failure' and retry_count>=3 then 'automatic_retries_exhausted' else p_failure_category end,
   customer_action_required=(p_status='requires_action'),
   next_retry_at=case when p_status='temporary_failure' and retry_count<3 then clock_timestamp()+case retry_count when 1 then interval '1 hour' else interval '6 hours' end else null end
 where id=p_obligation_id;
end $$;

create function public.apply_consequence_payment_event(p_stripe_event_id text,p_event_type text,
 p_stripe_payment_intent_id text,p_stripe_customer_id text,p_status text,p_failure_category text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e uuid; a private.consequence_charge_attempts%rowtype;
begin
 if p_status not in ('processing','succeeded','temporary_failure','requires_action','requires_payment_method','permanently_failed') then raise exception 'invalid payment status' using errcode='22023'; end if;
 insert into private.stripe_webhook_events(id,stripe_event_id,event_type) values(gen_random_uuid(),p_stripe_event_id,p_event_type) on conflict(stripe_event_id) do nothing returning id into e;
 if e is null then return jsonb_build_object('outcome','duplicate_event'); end if;
 select * into a from private.consequence_charge_attempts where stripe_payment_intent_id=p_stripe_payment_intent_id for update;
 if not found then return jsonb_build_object('outcome','unknown_payment_intent'); end if;
 if a.stripe_customer_id<>p_stripe_customer_id then return jsonb_build_object('outcome','customer_mismatch'); end if;
 if a.status='succeeded' then return jsonb_build_object('outcome','already_paid'); end if;
 update private.consequence_charge_attempts set status=p_status,failure_code=p_failure_category,
  customer_action_required=(p_status='requires_action'),completed_at=case when p_status='succeeded' then clock_timestamp() else null end,
  next_retry_at=case when p_status='temporary_failure' and retry_count<3 then clock_timestamp()+case retry_count when 1 then interval '1 hour' else interval '6 hours' end else null end
 where id=a.id;
 if p_status='succeeded' then update public.consequences set status='reward_fulfillment_pending' where id=a.consequence_id; end if;
 return jsonb_build_object('outcome',p_status,'obligationId',a.id);
end $$;

create function public.finish_consequence_payment_worker(p_run_id uuid,p_lease_token uuid,p_status text,p_eligible_count integer,p_attempted_count integer,p_failed_count integer,p_error_code text default null)
returns void language plpgsql security definer set search_path='' as $$ begin
 if p_status not in ('succeeded','partial_failure','failed') then raise exception 'invalid worker status' using errcode='22023'; end if;
 if not exists(select 1 from private.consequence_payment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token for update) then raise exception 'worker lease is not valid' using errcode='28000'; end if;
 update private.consequence_payment_worker_runs set status=p_status,finished_at=clock_timestamp(),eligible_count=p_eligible_count,attempted_count=p_attempted_count,failed_count=p_failed_count,error_code=left(p_error_code,120) where id=p_run_id;
 update private.consequence_payment_worker_lease set run_id=null,lease_token=null,locked_until=null where singleton;
end $$;

revoke all on function public.start_consequence_payment_worker() from public,anon,authenticated;
revoke all on function public.claim_due_consequence_payments(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.record_consequence_payment_intent(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.apply_consequence_payment_event(text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.finish_consequence_payment_worker(uuid,uuid,text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.start_consequence_payment_worker() to service_role;
grant execute on function public.claim_due_consequence_payments(uuid,uuid,integer) to service_role;
grant execute on function public.record_consequence_payment_intent(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.apply_consequence_payment_event(text,text,text,text,text,text) to service_role;
grant execute on function public.finish_consequence_payment_worker(uuid,uuid,text,integer,integer,integer,text) to service_role;

-- Narrow card-replacement preparation for an existing unpaid failed-challenge
-- obligation. It cannot create a charge or change amount/currency.
create function public.prepare_consequence_recovery_setup(p_owner_id uuid,p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.challenges%rowtype; co public.consequences%rowtype; a private.consequence_charge_attempts%rowtype; customer text;
begin
 select * into c from public.challenges where id=p_challenge_id and owner_id=p_owner_id;
 if not found then raise exception 'commitment not found' using errcode='P0002'; end if;
 select * into co from public.consequences where challenge_id=c.id;
 select * into a from private.consequence_charge_attempts where consequence_id=co.id;
 if c.challenge_status<>'completed_failure' or a.status not in ('requires_payment_method','requires_action') then raise exception 'payment recovery is not available' using errcode='22023'; end if;
 select stripe_customer_id into customer from private.stripe_customers where owner_id=p_owner_id;
 return jsonb_build_object('challengeId',c.id,'consequenceId',co.id,'existingStripeCustomerId',customer,'reusableSetupAttemptId',null,'reusableStripeSetupIntentId',null);
end $$;
create function public.record_consequence_recovery_setup_attempt(p_owner_id uuid,p_challenge_id uuid,p_stripe_customer_id text,p_stripe_setup_intent_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_co public.consequences%rowtype;a private.consequence_charge_attempts%rowtype;attempt uuid;
begin
 select co.* into v_co from public.consequences co join public.challenges c on c.id=co.challenge_id where c.id=p_challenge_id and c.owner_id=p_owner_id and c.challenge_status='completed_failure' for update of co;
 if not found then raise exception 'commitment not found' using errcode='P0002'; end if;
 select * into a from private.consequence_charge_attempts where consequence_id=v_co.id;
 if a.status not in ('requires_payment_method','requires_action') or a.stripe_customer_id<>p_stripe_customer_id then raise exception 'payment recovery is not available' using errcode='22023'; end if;
 insert into private.consequence_setup_attempts(consequence_id,owner_id,stripe_customer_id,stripe_setup_intent_id,status) values(v_co.id,p_owner_id,p_stripe_customer_id,p_stripe_setup_intent_id,'pending') returning id into attempt;
 return jsonb_build_object('setupAttemptId',attempt,'consequenceId',v_co.id);
end $$;
create function public.apply_consequence_recovery_setup_event(p_stripe_setup_intent_id text,p_stripe_customer_id text,p_stripe_payment_method_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.consequence_setup_attempts%rowtype;a private.consequence_charge_attempts%rowtype;c public.challenges%rowtype;
begin
 select * into s from private.consequence_setup_attempts where stripe_setup_intent_id=p_stripe_setup_intent_id and status='succeeded';
 if not found then return jsonb_build_object('outcome','not_recovery'); end if;
 select * into a from private.consequence_charge_attempts where consequence_id=s.consequence_id for update;
 select c.* into c from public.challenges c join public.consequences co on co.challenge_id=c.id where co.id=s.consequence_id;
 if c.challenge_status<>'completed_failure' or a.status not in ('requires_payment_method','requires_action') or a.stripe_customer_id<>p_stripe_customer_id then return jsonb_build_object('outcome','not_recoverable'); end if;
 update private.consequence_provider_references set payment_method_reference=p_stripe_payment_method_id,authorization_reference=p_stripe_setup_intent_id where consequence_id=s.consequence_id and customer_reference=p_stripe_customer_id;
 return jsonb_build_object('outcome','payment_method_replaced','obligationId',a.id);
end $$;
revoke all on function public.prepare_consequence_recovery_setup(uuid,uuid),public.record_consequence_recovery_setup_attempt(uuid,uuid,text,text),public.apply_consequence_recovery_setup_event(text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_consequence_recovery_setup(uuid,uuid),public.record_consequence_recovery_setup_attempt(uuid,uuid,text,text),public.apply_consequence_recovery_setup_event(text,text,text) to service_role;

-- Separate cadence from challenge completion. The worker can only discover
-- already-final completed_failure rows; it never calls completion logic.
do $$ begin
 if to_regnamespace('cron') is not null and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
  perform cron.schedule('kinwin-consequence-payments','17 * * * *',$job$
   select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='kinwin_project_url')||'/functions/v1/scheduled-charge-failed-consequences',
    headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='kinwin_cron_secret_key')),
    body := jsonb_build_object('source','supabase_cron'),timeout_milliseconds := 120000);
  $job$);
 else raise notice 'Cron/pg_net unavailable; hosted deployment must verify the payment job'; end if;
end $$;
