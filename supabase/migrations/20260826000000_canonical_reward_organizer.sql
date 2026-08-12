-- One immutable, server-owned reward organizer per prepared challenge.
create table public.challenge_reward_organizers (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique,
  owner_id uuid not null,
  organizer_kind text not null check (organizer_kind in ('recipient','other')),
  display_name text not null check (length(btrim(display_name)) between 1 and 50),
  challenge_recipient_id uuid,
  created_at timestamptz not null default now(),
  unique (id, challenge_id),
  foreign key (challenge_id, owner_id) references public.challenges(id, owner_id) on delete restrict,
  foreign key (challenge_recipient_id, challenge_id) references public.challenge_recipients(id, challenge_id) on delete restrict,
  check (
    (organizer_kind='recipient' and challenge_recipient_id is not null)
    or (organizer_kind='other' and challenge_recipient_id is null)
  )
);

create index challenge_reward_organizers_owner_idx on public.challenge_reward_organizers(owner_id);
alter table public.challenge_reward_organizers enable row level security;
create policy challenge_reward_organizers_select_own on public.challenge_reward_organizers for select to authenticated
  using (owner_id=(select auth.uid()));
revoke all on public.challenge_reward_organizers from public, anon, authenticated;
grant select on public.challenge_reward_organizers to authenticated;
grant select, insert, update, delete on public.challenge_reward_organizers to service_role;

create function private.ensure_canonical_reward_organizer(p_challenge_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.challenges%rowtype; d public.challenge_drafts%rowtype; org jsonb; linked public.challenge_recipients%rowtype; result uuid;
begin
  select * into c from public.challenges where id=p_challenge_id;
  if not found then raise exception 'challenge not found' using errcode='P0002'; end if;
  select id into result from public.challenge_reward_organizers where challenge_id=c.id;
  if result is not null then return result; end if;
  if c.source_draft_id is not null then select * into d from public.challenge_drafts where id=c.source_draft_id; end if;
  org:=coalesce(c.activation_snapshot->'rewardOrganizer',d.draft_payload->'rewardOrganizer');
  if org->>'type'='recipient' then
    select * into linked from public.challenge_recipients where challenge_id=c.id and recipient_role='recipient_organizer';
    if not found then
      select cr.* into linked from public.challenge_recipients cr
      join jsonb_array_elements(coalesce(c.activation_snapshot->'recipients',d.draft_payload->'recipients')) with ordinality elem(value,ordinality)
        on cr.sort_order=elem.ordinality-1
      where cr.challenge_id=c.id and elem.value->>'id'=org->>'recipientId';
    end if;
    if not found and not exists(select 1 from public.challenge_recipients where challenge_id=c.id) then
      insert into public.challenge_recipients(challenge_id,display_name,sort_order,recipient_role)
      select c.id,btrim(elem.value->>'name'),elem.ordinality-1,
        case when elem.value->>'id'=org->>'recipientId' then 'recipient_organizer' else 'recipient' end
      from jsonb_array_elements(coalesce(c.activation_snapshot->'recipients',d.draft_payload->'recipients')) with ordinality elem(value,ordinality);
      select * into linked from public.challenge_recipients where challenge_id=c.id and recipient_role='recipient_organizer';
    end if;
    if not found then raise exception 'recipient organizer is missing its challenge recipient' using errcode='23514'; end if;
    insert into public.challenge_reward_organizers(challenge_id,owner_id,organizer_kind,display_name,challenge_recipient_id)
      values(c.id,c.owner_id,'recipient',linked.display_name,linked.id) returning id into result;
  elsif org->>'type'='other' and length(btrim(org->>'name')) between 1 and 50 then
    insert into public.challenge_reward_organizers(challenge_id,owner_id,organizer_kind,display_name)
      values(c.id,c.owner_id,'other',btrim(org->>'name')) returning id into result;
  elsif org is null or org='null'::jsonb then return null;
  else raise exception 'canonical reward organizer cannot be derived' using errcode='23514'; end if;
  return result;
end $$;
revoke all on function private.ensure_canonical_reward_organizer(uuid) from public, anon, authenticated;
grant execute on function private.ensure_canonical_reward_organizer(uuid) to service_role;

create function private.create_canonical_reward_organizer_after_consequence()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.ensure_canonical_reward_organizer(new.challenge_id); return new; end $$;
revoke all on function private.create_canonical_reward_organizer_after_consequence() from public, anon, authenticated;
create trigger consequences_create_canonical_reward_organizer after insert on public.consequences
  for each row execute function private.create_canonical_reward_organizer_after_consequence();

create function private.ensure_canonical_reward_organizer_after_activation()
returns trigger language plpgsql security definer set search_path='' as $$
begin if new.challenge_status in ('active','completion_mode','awaiting_resolution','completed_success','completed_failure') then perform private.ensure_canonical_reward_organizer(new.id); end if; return new; end $$;
revoke all on function private.ensure_canonical_reward_organizer_after_activation() from public,anon,authenticated;
create trigger challenges_ensure_canonical_reward_organizer after update of challenge_status on public.challenges
  for each row execute function private.ensure_canonical_reward_organizer_after_activation();

-- Backfill any challenge package that predates the trigger from its immutable
-- activation snapshot or archived source draft. Incomplete legacy shells with
-- no trusted organizer payload remain explicit rather than receiving invented data.
do $$ declare row record; begin
  for row in select c.id from public.challenges c join public.consequences co on co.challenge_id=c.id
    where not exists(select 1 from public.challenge_reward_organizers o where o.challenge_id=c.id)
  loop perform private.ensure_canonical_reward_organizer(row.id); end loop;
end $$;

create function public.protect_canonical_reward_organizer()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception 'canonical reward organizer is immutable' using errcode='23000';
end $$;
revoke all on function public.protect_canonical_reward_organizer() from public, anon, authenticated;
create trigger challenge_reward_organizers_immutable before update or delete on public.challenge_reward_organizers
  for each row execute function public.protect_canonical_reward_organizer();

alter table public.invitations add column organizer_id uuid;
alter table public.invitations add constraint invitations_organizer_parent_fk
  foreign key (organizer_id,challenge_id) references public.challenge_reward_organizers(id,challenge_id) on delete restrict;
alter table public.invitations add constraint invitations_exactly_one_access_subject
  check (num_nonnulls(recipient_id,organizer_id)=1) not valid;
create unique index invitations_one_per_organizer_idx on public.invitations(organizer_id) where organizer_id is not null;

drop view private.accepted_recipient_delivery_targets;
create view private.accepted_reward_organizer_targets with (security_invoker=true) as
select o.id organizer_id,o.challenge_id,o.organizer_kind,o.challenge_recipient_id,
  i.id invitation_id,co.id consequence_id
from public.challenge_reward_organizers o
join public.consequences co on co.challenge_id=o.challenge_id
join public.invitations i on i.challenge_id=o.challenge_id and
  ((o.organizer_kind='recipient' and i.recipient_id=o.challenge_recipient_id) or
   (o.organizer_kind='other' and i.organizer_id=o.id))
where i.invitation_status='accepted' and i.token_hash is not null;
revoke all on private.accepted_reward_organizer_targets from public,anon,authenticated;
grant select on private.accepted_reward_organizer_targets to service_role;
