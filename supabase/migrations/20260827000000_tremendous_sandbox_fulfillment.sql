-- Sandbox-only reward fulfillment. Challenge and Stripe truth are prerequisites,
-- never outputs of this worker.
alter table private.reward_fulfillments
  add column organizer_id uuid,
  add column invitation_id uuid,
  add column idempotency_key text,
  add column provider_order_id text,
  add column provider_reward_id text,
  add column redemption_url text,
  add column attempt_count integer not null default 0,
  add column next_retry_at timestamptz,
  add column last_attempted_at timestamptz;

alter table private.reward_fulfillments drop constraint reward_fulfillments_status_check;
alter table private.reward_fulfillments add constraint reward_fulfillments_status_check
  check (status in ('pending','processing','provider_created','delivered','retryable_failure','terminal_failure','canceled'));
alter table private.reward_fulfillments
  add constraint reward_fulfillments_one_obligation unique(consequence_id),
  add constraint reward_fulfillments_idempotency_unique unique(idempotency_key),
  add constraint reward_fulfillments_provider_order_unique unique(provider_order_id),
  add constraint reward_fulfillments_provider_reward_unique unique(provider_reward_id),
  add constraint reward_fulfillments_organizer_fk foreign key(organizer_id) references public.challenge_reward_organizers(id) on delete restrict,
  add constraint reward_fulfillments_invitation_fk foreign key(invitation_id) references public.invitations(id) on delete restrict,
  add constraint reward_fulfillments_provider_binding check (
    (provider_order_id is null and provider_reward_id is null and redemption_url is null)
    or (provider_order_id is not null and provider_reward_id is not null and redemption_url is not null)
  ),
  add constraint reward_fulfillments_delivered_evidence check (
    status <> 'delivered' or (delivered_at is not null and provider_order_id is not null and provider_reward_id is not null and redemption_url is not null)
  );

create index reward_fulfillments_due_idx on private.reward_fulfillments(next_retry_at)
  where status in ('pending','retryable_failure');

create function private.protect_reward_fulfillment_binding()
returns trigger language plpgsql set search_path='' as $$ begin
  if old.consequence_id is distinct from new.consequence_id
    or old.organizer_id is distinct from new.organizer_id
    or old.invitation_id is distinct from new.invitation_id
    or old.amount_minor_units is distinct from new.amount_minor_units
    or old.currency is distinct from new.currency
    or old.idempotency_key is distinct from new.idempotency_key
    or (old.provider_order_id is not null and old.provider_order_id is distinct from new.provider_order_id)
    or (old.provider_reward_id is not null and old.provider_reward_id is distinct from new.provider_reward_id)
    or (old.redemption_url is not null and old.redemption_url is distinct from new.redemption_url) then
    raise exception 'reward fulfillment binding is immutable' using errcode='23000';
  end if;
  return new;
end $$;
revoke all on function private.protect_reward_fulfillment_binding() from public,anon,authenticated;
create trigger reward_fulfillments_protect_binding before update on private.reward_fulfillments
  for each row execute function private.protect_reward_fulfillment_binding();

create table private.reward_fulfillment_worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  status text not null default 'running' check(status in ('running','succeeded','partial_failure','failed')),
  eligible_count integer not null default 0,
  attempted_count integer not null default 0,
  failed_count integer not null default 0,
  error_code text
);
create table private.reward_fulfillment_worker_lease (
  singleton boolean primary key default true check(singleton),
  run_id uuid references private.reward_fulfillment_worker_runs(id),
  lease_token uuid,
  locked_until timestamptz,
  check ((run_id is null and lease_token is null and locked_until is null) or
    (run_id is not null and lease_token is not null and locked_until is not null))
);
insert into private.reward_fulfillment_worker_lease(singleton) values(true);
alter table private.reward_fulfillments enable row level security;
alter table private.reward_fulfillment_worker_runs enable row level security;
alter table private.reward_fulfillment_worker_lease enable row level security;
revoke all on private.reward_fulfillments,private.reward_fulfillment_worker_runs,private.reward_fulfillment_worker_lease from public,anon,authenticated;
grant select,insert,update on private.reward_fulfillments,private.reward_fulfillment_worker_runs to service_role;
grant select,update on private.reward_fulfillment_worker_lease to service_role;

create function public.start_reward_fulfillment_worker()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v private.reward_fulfillment_worker_lease%rowtype;r uuid;t uuid;
begin
  select * into v from private.reward_fulfillment_worker_lease where singleton for update;
  if v.locked_until>clock_timestamp() then return jsonb_build_object('status','already_running','runId',v.run_id); end if;
  if v.run_id is not null then update private.reward_fulfillment_worker_runs set status='failed',finished_at=clock_timestamp(),error_code='lease_expired' where id=v.run_id and status='running'; end if;
  insert into private.reward_fulfillment_worker_runs default values returning id into r;t:=gen_random_uuid();
  update private.reward_fulfillment_worker_lease set run_id=r,lease_token=t,locked_until=clock_timestamp()+interval '20 minutes' where singleton;
  return jsonb_build_object('status','started','runId',r,'leaseToken',t);
end $$;

create function public.claim_due_reward_fulfillments(p_run_id uuid,p_lease_token uuid,p_limit integer default 25)
returns table(obligation_id uuid,idempotency_key text,amount_minor_units bigint,currency text,organizer_name text,recipient_names text[],category text)
language plpgsql security definer set search_path='' as $$ begin
  if p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100' using errcode='22023'; end if;
  if not exists(select 1 from private.reward_fulfillment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token and locked_until>clock_timestamp()) then raise exception 'worker lease is not valid' using errcode='28000'; end if;
  insert into private.reward_fulfillments(id,consequence_id,organizer_id,invitation_id,idempotency_key,fulfillment_provider,status,amount_minor_units,currency,requested_at)
  select gen_random_uuid(),target.consequence_id,target.organizer_id,target.invitation_id,'kinwin-reward:'||target.consequence_id,'tremendous_sandbox','pending',co.stake_minor_units,co.currency,clock_timestamp()
  from private.accepted_reward_organizer_targets target
  join public.consequences co on co.id=target.consequence_id and co.status='reward_fulfillment_pending'
  join public.challenges c on c.id=co.challenge_id and c.challenge_status='completed_failure'
  join private.consequence_charge_attempts charge on charge.consequence_id=co.id and charge.status='succeeded'
  on conflict(consequence_id) do nothing;

  return query with due as (
    select f.id from private.reward_fulfillments f
    where f.status in ('pending','retryable_failure') and f.attempt_count<5
      and (f.next_retry_at is null or f.next_retry_at<=clock_timestamp())
    order by f.requested_at,f.id limit p_limit for update skip locked
  ),claimed as (
    update private.reward_fulfillments f set status='processing',attempt_count=f.attempt_count+1,last_attempted_at=clock_timestamp(),next_retry_at=null,failure_code=null
    from due where f.id=due.id returning f.*
  ) select f.id,f.idempotency_key,f.amount_minor_units,f.currency,o.display_name,
      array(select cr.display_name from public.challenge_recipients cr where cr.challenge_id=o.challenge_id order by cr.sort_order),
      coalesce(c.activation_snapshot->>'consequenceCategory','')
    from claimed f join public.challenge_reward_organizers o on o.id=f.organizer_id
    join public.consequences co on co.id=f.consequence_id join public.challenges c on c.id=co.challenge_id;
end $$;

create function public.record_reward_fulfillment_result(p_obligation_id uuid,p_run_id uuid,p_lease_token uuid,p_succeeded boolean,p_retryable boolean,p_provider_order_id text default null,p_provider_reward_id text default null,p_redemption_url text default null,p_failure_code text default null)
returns void language plpgsql security definer set search_path='' as $$
declare f private.reward_fulfillments%rowtype;
begin
  if not exists(select 1 from private.reward_fulfillment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token) then raise exception 'worker lease is not valid' using errcode='28000'; end if;
  select * into f from private.reward_fulfillments where id=p_obligation_id for update;
  if not found then raise exception 'fulfillment not found' using errcode='P0002'; end if;
  if f.status='delivered' then return; end if;
  if p_succeeded and (p_provider_order_id is null or p_provider_reward_id is null or p_redemption_url is null or p_redemption_url !~ '^https://') then raise exception 'provider evidence is incomplete' using errcode='22023'; end if;
  update private.reward_fulfillments set
    provider_reference=case when p_succeeded then p_provider_order_id else provider_reference end,
    provider_order_id=case when p_succeeded then p_provider_order_id else provider_order_id end,
    provider_reward_id=case when p_succeeded then p_provider_reward_id else provider_reward_id end,
    redemption_url=case when p_succeeded then p_redemption_url else redemption_url end,
    status=case when p_succeeded then 'delivered' when p_retryable and attempt_count<5 then 'retryable_failure' else 'terminal_failure' end,
    delivered_at=case when p_succeeded then clock_timestamp() else null end,
    failure_code=case when p_succeeded then null else left(p_failure_code,120) end,
    next_retry_at=case when not p_succeeded and p_retryable and attempt_count<5 then clock_timestamp()+interval '1 hour' else null end
  where id=f.id;
  if p_succeeded then update public.consequences set status='reward_delivered' where id=f.consequence_id and status='reward_fulfillment_pending'; end if;
end $$;

create function public.finish_reward_fulfillment_worker(p_run_id uuid,p_lease_token uuid,p_status text,p_eligible_count integer,p_attempted_count integer,p_failed_count integer,p_error_code text default null)
returns void language plpgsql security definer set search_path='' as $$ begin
  if p_status not in ('succeeded','partial_failure','failed') then raise exception 'invalid worker status' using errcode='22023'; end if;
  if not exists(select 1 from private.reward_fulfillment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token for update) then raise exception 'worker lease is not valid' using errcode='28000'; end if;
  update private.reward_fulfillment_worker_runs set status=p_status,finished_at=clock_timestamp(),eligible_count=p_eligible_count,attempted_count=p_attempted_count,failed_count=p_failed_count,error_code=left(p_error_code,120) where id=p_run_id;
  update private.reward_fulfillment_worker_lease set run_id=null,lease_token=null,locked_until=null where singleton;
end $$;

revoke all on function public.start_reward_fulfillment_worker() from public,anon,authenticated;
revoke all on function public.claim_due_reward_fulfillments(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.record_reward_fulfillment_result(uuid,uuid,uuid,boolean,boolean,text,text,text,text) from public,anon,authenticated;
revoke all on function public.finish_reward_fulfillment_worker(uuid,uuid,text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.start_reward_fulfillment_worker() to service_role;
grant execute on function public.claim_due_reward_fulfillments(uuid,uuid,integer) to service_role;
grant execute on function public.record_reward_fulfillment_result(uuid,uuid,uuid,boolean,boolean,text,text,text,text) to service_role;
grant execute on function public.finish_reward_fulfillment_worker(uuid,uuid,text,integer,integer,integer,text) to service_role;

create function public.get_accepted_organizer_reward_handoff(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'status',case f.status when 'delivered' then 'ready' when 'terminal_failure' then 'needs_attention' else 'preparing' end,
    'redemptionUrl',case when f.status='delivered' then f.redemption_url else null end
  ) into result
  from private.reward_fulfillments f
  join private.accepted_reward_organizer_targets target on target.consequence_id=f.consequence_id and target.organizer_id=f.organizer_id and target.invitation_id=p_invitation_id;
  return result;
end $$;
revoke all on function public.get_accepted_organizer_reward_handoff(uuid) from public,anon,authenticated;
grant execute on function public.get_accepted_organizer_reward_handoff(uuid) to service_role;
