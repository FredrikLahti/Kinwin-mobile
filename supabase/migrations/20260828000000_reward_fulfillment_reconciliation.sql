-- Provider creation and reward availability are separate facts. Polling is
-- used until Tremendous's callback contract can be verified from primary docs.
alter table private.reward_fulfillments
  add column provider_status text,
  add column provider_created_at timestamptz,
  add column last_reconciled_at timestamptz,
  add column reconciliation_attempt_count integer not null default 0 check(reconciliation_attempt_count between 0 and 20),
  add column reconciliation_next_retry_at timestamptz;

drop trigger reward_fulfillments_protect_binding on private.reward_fulfillments;
alter table private.reward_fulfillments drop constraint reward_fulfillments_status_check;
alter table private.reward_fulfillments drop constraint reward_fulfillments_provider_binding;
alter table private.reward_fulfillments drop constraint reward_fulfillments_delivered_evidence;
alter table private.reward_fulfillments add constraint reward_fulfillments_status_check check(status in (
  'pending','processing','provider_created','reconciling','reconciliation_retry','delivered','retryable_failure','terminal_failure','canceled'
));
alter table private.reward_fulfillments add constraint reward_fulfillments_provider_binding check(
  (provider_order_id is null and provider_reward_id is null and redemption_url is null)
  or (provider_order_id is not null and provider_reward_id is not null)
);
alter table private.reward_fulfillments add constraint reward_fulfillments_delivered_evidence check(
  status<>'delivered' or (delivered_at is not null and provider_status is not null and provider_order_id is not null and provider_reward_id is not null and redemption_url is not null)
);

-- Any sandbox row created under the previous optimistic rule must be proven
-- ready again. Provider IDs remain immutable; the unverified artifact is removed.
update public.consequences co set status='reward_fulfillment_pending'
from private.reward_fulfillments f where f.consequence_id=co.id and f.fulfillment_provider='tremendous_sandbox' and f.status='delivered' and co.status='reward_delivered';
update private.reward_fulfillments set status='provider_created',delivered_at=null,redemption_url=null,
  provider_created_at=coalesce(provider_created_at,updated_at),reconciliation_next_retry_at=clock_timestamp()
where fulfillment_provider='tremendous_sandbox' and status='delivered';

create trigger reward_fulfillments_protect_binding before update on private.reward_fulfillments
  for each row execute function private.protect_reward_fulfillment_binding();
create index reward_fulfillments_reconcile_due_idx on private.reward_fulfillments(reconciliation_next_retry_at)
  where status in ('provider_created','reconciliation_retry');

create or replace function public.record_reward_fulfillment_result(p_obligation_id uuid,p_run_id uuid,p_lease_token uuid,p_succeeded boolean,p_retryable boolean,p_provider_order_id text default null,p_provider_reward_id text default null,p_redemption_url text default null,p_failure_code text default null)
returns void language plpgsql security definer set search_path='' as $$
declare f private.reward_fulfillments%rowtype;
begin
  if not exists(select 1 from private.reward_fulfillment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token) then raise exception 'worker lease is not valid' using errcode='28000'; end if;
  select * into f from private.reward_fulfillments where id=p_obligation_id for update;
  if not found then raise exception 'fulfillment not found' using errcode='P0002'; end if;
  if f.status in ('provider_created','reconciling','reconciliation_retry','delivered') then return; end if;
  if p_succeeded and (p_provider_order_id is null or p_provider_reward_id is null) then raise exception 'provider creation evidence is incomplete' using errcode='22023'; end if;
  update private.reward_fulfillments set
    provider_reference=case when p_succeeded then p_provider_order_id else provider_reference end,
    provider_order_id=case when p_succeeded then p_provider_order_id else provider_order_id end,
    provider_reward_id=case when p_succeeded then p_provider_reward_id else provider_reward_id end,
    status=case when p_succeeded then 'provider_created' when p_retryable and attempt_count<5 then 'retryable_failure' else 'terminal_failure' end,
    provider_created_at=case when p_succeeded then clock_timestamp() else provider_created_at end,
    failure_code=case when p_succeeded then null else left(p_failure_code,120) end,
    next_retry_at=case when not p_succeeded and p_retryable and attempt_count<5 then clock_timestamp()+interval '1 hour' else null end,
    reconciliation_next_retry_at=case when p_succeeded then clock_timestamp() else reconciliation_next_retry_at end
  where id=f.id;
end $$;

create function public.claim_due_reward_reconciliations(p_run_id uuid,p_lease_token uuid,p_limit integer default 25)
returns table(obligation_id uuid,provider_reward_id text)
language plpgsql security definer set search_path='' as $$ begin
  if p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100' using errcode='22023'; end if;
  if not exists(select 1 from private.reward_fulfillment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token and locked_until>clock_timestamp()) then raise exception 'worker lease is not valid' using errcode='28000'; end if;
  return query with due as (
    select f.id from private.reward_fulfillments f join public.consequences co on co.id=f.consequence_id
    join public.challenges c on c.id=co.challenge_id
    where f.status in ('provider_created','reconciliation_retry') and f.provider_order_id is not null and f.provider_reward_id is not null
      and f.reconciliation_attempt_count<10 and (f.reconciliation_next_retry_at is null or f.reconciliation_next_retry_at<=clock_timestamp())
      and co.status='reward_fulfillment_pending' and c.challenge_status='completed_failure'
    order by f.provider_created_at,f.id limit p_limit for update of f skip locked
  ),claimed as (
    update private.reward_fulfillments f set status='reconciling',reconciliation_attempt_count=f.reconciliation_attempt_count+1,
      last_reconciled_at=clock_timestamp(),reconciliation_next_retry_at=null,failure_code=null
    from due where f.id=due.id returning f.*
  ) select f.id,f.provider_reward_id from claimed f;
end $$;

create function public.record_reward_reconciliation_result(p_obligation_id uuid,p_run_id uuid,p_lease_token uuid,p_result text,p_provider_status text default null,p_redemption_url text default null,p_retryable boolean default false,p_failure_code text default null)
returns void language plpgsql security definer set search_path='' as $$
declare f private.reward_fulfillments%rowtype;
begin
  if p_result not in ('processing','ready','failure') then raise exception 'invalid reconciliation result' using errcode='22023'; end if;
  if not exists(select 1 from private.reward_fulfillment_worker_lease where singleton and run_id=p_run_id and lease_token=p_lease_token) then raise exception 'worker lease is not valid' using errcode='28000'; end if;
  select * into f from private.reward_fulfillments where id=p_obligation_id for update;
  if not found then raise exception 'fulfillment not found' using errcode='P0002'; end if;
  if f.status='delivered' then return; end if;
  if f.provider_order_id is null or f.provider_reward_id is null then raise exception 'provider identity is missing' using errcode='23514'; end if;
  if p_result='ready' and (p_provider_status is null or p_redemption_url is null or p_redemption_url !~ '^https://') then raise exception 'ready evidence is incomplete' using errcode='22023'; end if;
  update private.reward_fulfillments set
    provider_status=coalesce(nullif(left(p_provider_status,80),''),provider_status),
    redemption_url=case when p_result='ready' then p_redemption_url else redemption_url end,
    status=case when p_result='ready' then 'delivered' when p_result='processing' then 'provider_created'
      when p_retryable and reconciliation_attempt_count<10 then 'reconciliation_retry' else 'terminal_failure' end,
    delivered_at=case when p_result='ready' then clock_timestamp() else delivered_at end,
    failure_code=case when p_result='failure' then left(p_failure_code,120) else null end,
    reconciliation_next_retry_at=case when p_result='processing' then clock_timestamp()+interval '15 minutes'
      when p_result='failure' and p_retryable and reconciliation_attempt_count<10 then clock_timestamp()+interval '1 hour' else null end
  where id=f.id;
  if p_result='ready' then update public.consequences set status='reward_delivered' where id=f.consequence_id and status='reward_fulfillment_pending'; end if;
end $$;

create or replace function public.get_accepted_organizer_reward_handoff(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'status',case when f.status='delivered' then 'ready' when f.status='terminal_failure' then 'needs_attention'
      when f.status in ('provider_created','reconciling','reconciliation_retry') then 'processing' else 'preparing' end,
    'redemptionUrl',case when f.status='delivered' and f.provider_status is not null then f.redemption_url else null end
  ) into result
  from private.reward_fulfillments f join private.accepted_reward_organizer_targets target
    on target.consequence_id=f.consequence_id and target.organizer_id=f.organizer_id and target.invitation_id=p_invitation_id;
  return result;
end $$;

revoke all on function public.claim_due_reward_reconciliations(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.record_reward_reconciliation_result(uuid,uuid,uuid,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_due_reward_reconciliations(uuid,uuid,integer) to service_role;
grant execute on function public.record_reward_reconciliation_result(uuid,uuid,uuid,text,text,text,boolean,text) to service_role;
