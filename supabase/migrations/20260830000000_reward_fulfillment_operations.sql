-- Operational recovery, service-only visibility, and LINK access auditing.
alter table private.reward_fulfillments
  add column reward_link_last_requested_at timestamptz,
  add column reward_link_last_generated_at timestamptz,
  add column reward_link_request_count integer not null default 0 check (reward_link_request_count >= 0),
  add column reward_link_last_failure_code text;

create table private.reward_link_access_events (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references private.reward_fulfillments(id) on delete restrict,
  invitation_id uuid not null references public.invitations(id) on delete restrict,
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  outcome text not null default 'requested' check (outcome in ('requested','generated','failed')),
  failure_code text
);
create index reward_link_access_events_fulfillment_idx
  on private.reward_link_access_events(fulfillment_id, requested_at desc);
alter table private.reward_link_access_events enable row level security;
revoke all on private.reward_link_access_events from public,anon,authenticated;
grant select,insert,update on private.reward_link_access_events to service_role;

-- Starting either reward worker also repairs work abandoned after a process crash.
-- Provider identities and the immutable consequence binding are never changed.
create or replace function public.start_reward_fulfillment_worker()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v private.reward_fulfillment_worker_lease%rowtype;r uuid;t uuid;
begin
  select * into v from private.reward_fulfillment_worker_lease where singleton for update;
  if v.locked_until>clock_timestamp() then return jsonb_build_object('status','already_running','runId',v.run_id); end if;
  if v.run_id is not null then update private.reward_fulfillment_worker_runs set status='failed',finished_at=clock_timestamp(),error_code='lease_expired' where id=v.run_id and status='running'; end if;

  update private.reward_fulfillments set
    status=case when attempt_count>=5 then 'terminal_failure' else 'retryable_failure' end,
    next_retry_at=case when attempt_count<5 then clock_timestamp() else null end,
    failure_code=case when attempt_count>=5 then 'creation_retries_exhausted' else 'stale_creation_claim' end
  where status='processing' and last_attempted_at<clock_timestamp()-interval '25 minutes';
  update private.reward_fulfillments set
    status=case when reconciliation_attempt_count>=10 then 'terminal_failure' else 'reconciliation_retry' end,
    reconciliation_next_retry_at=case when reconciliation_attempt_count<10 then clock_timestamp() else null end,
    failure_code=case when reconciliation_attempt_count>=10 then 'reconciliation_retries_exhausted' else 'stale_reconciliation_claim' end
  where status='reconciling' and last_reconciled_at<clock_timestamp()-interval '25 minutes';
  update private.reward_fulfillments set status='terminal_failure',reconciliation_next_retry_at=null,
    failure_code='reconciliation_retries_exhausted'
  where status in ('provider_created','reconciliation_retry') and reconciliation_attempt_count>=10;
  update private.reward_fulfillments set status='terminal_failure',next_retry_at=null,
    failure_code='creation_retries_exhausted'
  where status in ('pending','retryable_failure') and attempt_count>=5;

  insert into private.reward_fulfillment_worker_runs default values returning id into r;t:=gen_random_uuid();
  update private.reward_fulfillment_worker_lease set run_id=r,lease_token=t,locked_until=clock_timestamp()+interval '20 minutes' where singleton;
  return jsonb_build_object('status','started','runId',r,'leaseToken',t);
end $$;

-- Atomic authorization and a short cooldown prevent duplicate taps from causing
-- bursts of generate_link calls. The provider reward id remains server-resolved.
drop function public.prepare_accepted_organizer_reward_link(uuid);
create function public.prepare_accepted_organizer_reward_link(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f private.reward_fulfillments%rowtype; event_id uuid;
begin
  select fulfillment.* into f from private.reward_fulfillments fulfillment
  join private.accepted_reward_organizer_targets target
    on target.consequence_id=fulfillment.consequence_id and target.organizer_id=fulfillment.organizer_id
      and target.invitation_id=p_invitation_id
  where fulfillment.status='delivered' and fulfillment.provider_status='SUCCEEDED'
    and fulfillment.provider_order_id is not null and fulfillment.provider_reward_id is not null
  for update of fulfillment;
  if not found then return null; end if;
  if f.reward_link_last_requested_at is not null and f.reward_link_last_requested_at>clock_timestamp()-interval '30 seconds' then
    return jsonb_build_object('outcome','cooldown');
  end if;
  update private.reward_fulfillments set reward_link_last_requested_at=clock_timestamp(),
    reward_link_request_count=reward_link_request_count+1,reward_link_last_failure_code=null where id=f.id;
  insert into private.reward_link_access_events(fulfillment_id,invitation_id) values(f.id,p_invitation_id) returning id into event_id;
  return jsonb_build_object('outcome','allowed','providerRewardId',f.provider_reward_id,'accessEventId',event_id);
end $$;

create function public.record_organizer_reward_link_result(p_event_id uuid,p_succeeded boolean,p_failure_code text default null)
returns void language plpgsql security definer set search_path='' as $$
declare event private.reward_link_access_events%rowtype;
begin
  select * into event from private.reward_link_access_events where id=p_event_id for update;
  if not found or event.outcome<>'requested' then return; end if;
  update private.reward_link_access_events set completed_at=clock_timestamp(),
    outcome=case when p_succeeded then 'generated' else 'failed' end,
    failure_code=case when p_succeeded then null else left(p_failure_code,120) end where id=event.id;
  update private.reward_fulfillments set
    reward_link_last_generated_at=case when p_succeeded then clock_timestamp() else reward_link_last_generated_at end,
    reward_link_last_failure_code=case when p_succeeded then null else left(p_failure_code,120) end
  where id=event.fulfillment_id;
end $$;
revoke all on function public.prepare_accepted_organizer_reward_link(uuid) from public,anon,authenticated;
revoke all on function public.record_organizer_reward_link_result(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.prepare_accepted_organizer_reward_link(uuid) to service_role;
grant execute on function public.record_organizer_reward_link_result(uuid,boolean,text) to service_role;

create view private.reward_fulfillment_health as
select c.id challenge_id,co.id consequence_id,o.id organizer_id,i.id invitation_id,f.id fulfillment_id,
  case
    when i.invitation_status is distinct from 'accepted' then 'waiting_for_organizer'
    when f.id is null then 'ready_for_provider_creation'
    when f.status in ('pending','processing') then 'provider_creation_pending'
    when f.status='retryable_failure' then 'provider_creation_retrying'
    when f.status in ('provider_created','reconciling') then 'awaiting_provider_readiness'
    when f.status='reconciliation_retry' then 'reconciliation_retrying'
    when f.status='delivered' then 'delivered'
    when f.status='terminal_failure' then 'support_required'
    else 'not_applicable' end health_state,
  i.invitation_status organizer_invitation_status,f.status fulfillment_status,
  f.attempt_count,f.reconciliation_attempt_count,f.requested_at,f.last_attempted_at,
  f.provider_created_at,f.last_reconciled_at,f.delivered_at,
  coalesce(f.reconciliation_next_retry_at,f.next_retry_at) next_retry_at,f.failure_code,
  f.reward_link_last_requested_at,f.reward_link_last_generated_at,f.reward_link_request_count
from public.challenges c join public.consequences co on co.challenge_id=c.id
join public.challenge_reward_organizers o on o.challenge_id=c.id
left join public.invitations i on i.organizer_id=o.id or (o.organizer_kind='recipient' and i.recipient_id=o.challenge_recipient_id)
left join private.reward_fulfillments f on f.consequence_id=co.id and f.organizer_id=o.id
where c.challenge_status='completed_failure' and co.status in ('reward_fulfillment_pending','reward_delivered');
revoke all on private.reward_fulfillment_health from public,anon,authenticated;
grant select on private.reward_fulfillment_health to service_role;

-- Cron only wakes trusted workers. Leases and database predicates remain authoritative.
do $$ begin
 if to_regnamespace('cron') is not null and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
  perform cron.schedule('kinwin-reward-fulfillment','7,37 * * * *',$job$
   select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='kinwin_project_url')||'/functions/v1/scheduled-fulfill-rewards',
    headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='kinwin_cron_secret_key')),
    body := jsonb_build_object('source','supabase_cron'),timeout_milliseconds := 120000);$job$);
  perform cron.schedule('kinwin-reward-reconciliation','5,20,35,50 * * * *',$job$
   select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='kinwin_project_url')||'/functions/v1/scheduled-reconcile-rewards',
    headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='kinwin_cron_secret_key')),
    body := jsonb_build_object('source','supabase_cron'),timeout_milliseconds := 120000);$job$);
 else raise notice 'Cron/pg_net unavailable; hosted deployment must verify reward worker jobs'; end if;
end $$;
