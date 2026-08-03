-- Kinwin initial production schema. Trusted writes are intentionally not exposed to clients.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.challenge_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  schema_version integer not null default 1 check (schema_version = 1),
  draft_payload jsonb not null check (jsonb_typeof(draft_payload) = 'object' and draft_payload <> '{}'::jsonb),
  draft_status text not null default 'editing' check (draft_status in ('editing', 'ready_for_activation', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (draft_payload ->> 'id' is not null and draft_payload ->> 'id' = id::text),
  check (draft_payload ->> 'ownerId' is not null and draft_payload ->> 'ownerId' = owner_id::text),
  check (draft_payload ->> 'schemaVersion' is not null and (draft_payload ->> 'schemaVersion')::integer = schema_version),
  check (jsonb_typeof(draft_payload -> 'goal') is not distinct from 'string'),
  check (jsonb_typeof(draft_payload -> 'behavior') is not distinct from 'object'),
  check (jsonb_typeof(draft_payload #> '{behavior,completionDefinition}') is not distinct from 'string'),
  check (jsonb_typeof(draft_payload -> 'duration') is not distinct from 'object'),
  check (jsonb_typeof(draft_payload -> 'successRule') is not distinct from 'object'),
  check (case when jsonb_typeof(draft_payload -> 'recipients') = 'array'
    then jsonb_array_length(draft_payload -> 'recipients') between 0 and 4 else false end),
  check (draft_payload ? 'rewardOrganizer' and jsonb_typeof(draft_payload -> 'rewardOrganizer') in ('object', 'null')),
  check (draft_payload ? 'experienceCategory' and jsonb_typeof(draft_payload -> 'experienceCategory') in ('string', 'null')),
  check (jsonb_typeof(draft_payload -> 'stake') is not distinct from 'object'),
  check (jsonb_typeof(draft_payload #> '{stake,minorUnits}') is not distinct from 'number'),
  check (jsonb_typeof(draft_payload #> '{stake,currency}') is not distinct from 'string'),
  check (jsonb_typeof(draft_payload -> 'sitOutAcknowledged') is not distinct from 'boolean'),
  check (jsonb_typeof(draft_payload -> 'invitationMessage') is not distinct from 'string'),
  check (draft_payload ? 'membershipSelection' and jsonb_typeof(draft_payload -> 'membershipSelection') in ('string', 'null'))
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  source_draft_id uuid references public.challenge_drafts (id) on delete set null,
  schema_version integer not null check (schema_version = 1),
  rule_engine_version integer not null check (rule_engine_version = 1),
  challenge_status text not null check (challenge_status in (
    'pending_activation', 'active', 'completion_mode', 'completed_success',
    'completed_failure', 'canceled_before_activation'
  )),
  timezone text,
  activated_at timestamptz,
  starts_at timestamptz,
  planned_ends_at timestamptz,
  completed_at timestamptz,
  activation_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (activation_snapshot is null or (
    jsonb_typeof(activation_snapshot) = 'object' and activation_snapshot <> '{}'::jsonb
    and activation_snapshot ->> 'id' is not null and activation_snapshot ->> 'id' = id::text
    and activation_snapshot ->> 'ownerId' is not null and activation_snapshot ->> 'ownerId' = owner_id::text
    and activation_snapshot ->> 'schemaVersion' is not null
    and (activation_snapshot ->> 'schemaVersion')::integer = schema_version
    and activation_snapshot ->> 'ruleEngineVersion' is not null
    and (activation_snapshot ->> 'ruleEngineVersion')::integer = rule_engine_version
    and jsonb_typeof(activation_snapshot -> 'goal') is not distinct from 'string'
    and jsonb_typeof(activation_snapshot -> 'behavior') is not distinct from 'object'
    and jsonb_typeof(activation_snapshot #> '{behavior,completionDefinition}') is not distinct from 'string'
    and jsonb_typeof(activation_snapshot -> 'duration') is not distinct from 'object'
    and jsonb_typeof(activation_snapshot -> 'successRule') is not distinct from 'object'
    and case when jsonb_typeof(activation_snapshot -> 'recipients') = 'array'
      then jsonb_array_length(activation_snapshot -> 'recipients') between 1 and 4 else false end
    and jsonb_typeof(activation_snapshot -> 'rewardOrganizer') is not distinct from 'object'
    and jsonb_typeof(activation_snapshot -> 'consequenceCategory') is not distinct from 'string'
    and jsonb_typeof(activation_snapshot -> 'stake') is not distinct from 'object'
    and jsonb_typeof(activation_snapshot #> '{stake,minorUnits}') is not distinct from 'number'
    and jsonb_typeof(activation_snapshot #> '{stake,currency}') is not distinct from 'string'
    and jsonb_typeof(activation_snapshot -> 'sitOutAcknowledged') is not distinct from 'boolean'
    and jsonb_typeof(activation_snapshot -> 'membershipStatusAtActivation') is not distinct from 'string'
  )),
  check (planned_ends_at is null or starts_at is null or planned_ends_at > starts_at),
  check (
    challenge_status in ('pending_activation', 'canceled_before_activation')
    or (activated_at is not null and starts_at is not null and planned_ends_at is not null
        and timezone is not null and length(btrim(timezone)) > 0
        and activation_snapshot is not null and jsonb_typeof(activation_snapshot) = 'object'
        and activation_snapshot <> '{}'::jsonb)
  ),
  check (
    (challenge_status in ('completed_success', 'completed_failure') and completed_at is not null)
    or (challenge_status not in ('completed_success', 'completed_failure') and completed_at is null)
  )
);

create function public.protect_activated_challenge_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.activated_at is not null or old.challenge_status in (
    'active', 'completion_mode', 'completed_success', 'completed_failure'
  ) then
    if new.activation_snapshot is distinct from old.activation_snapshot
      or new.owner_id is distinct from old.owner_id
      or new.activated_at is distinct from old.activated_at
      or new.starts_at is distinct from old.starts_at
      or new.planned_ends_at is distinct from old.planned_ends_at
      or new.timezone is distinct from old.timezone
      or new.schema_version is distinct from old.schema_version
      or new.rule_engine_version is distinct from old.rule_engine_version then
      raise exception 'activated challenge commitment fields are immutable'
        using errcode = '23000';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_activated_challenge_snapshot() from public, anon, authenticated;

create table public.challenge_recipients (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 50),
  sort_order smallint not null check (sort_order between 0 and 3),
  recipient_role text not null default 'recipient' check (recipient_role in ('recipient', 'recipient_organizer')),
  created_at timestamptz not null default now(),
  unique (challenge_id, sort_order),
  unique (id, challenge_id)
);

create table public.challenge_periods (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete restrict,
  period_number integer not null check (period_number > 0),
  period_kind text not null check (period_kind in ('day', 'week', 'continuous')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  target_payload jsonb not null check (jsonb_typeof(target_payload) = 'object' and target_payload <> '{}'::jsonb),
  computed_status text not null default 'pending' check (computed_status in ('pending', 'on_track', 'met', 'missed', 'exceeded')),
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, period_number),
  unique (id, challenge_id),
  check (ends_at > starts_at)
);

create table public.check_in_events (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null,
  owner_id uuid not null,
  period_id uuid,
  schema_version integer not null default 1 check (schema_version = 1),
  event_type text not null check (event_type in ('build_completion', 'cut_back_total', 'stop_intact', 'stop_lapse', 'correction')),
  event_payload jsonb not null check (jsonb_typeof(event_payload) = 'object' and event_payload <> '{}'::jsonb),
  source text not null check (source in ('ios', 'android', 'web', 'server', 'support')),
  client_recorded_at timestamptz not null,
  server_recorded_at timestamptz not null default now(),
  idempotency_key text check (idempotency_key is null or length(btrim(idempotency_key)) between 1 and 200),
  correction_of_event_id uuid,
  created_at timestamptz not null default now(),
  unique (id, challenge_id),
  foreign key (challenge_id, owner_id) references public.challenges (id, owner_id) on delete restrict,
  foreign key (period_id, challenge_id) references public.challenge_periods (id, challenge_id) on delete restrict,
  foreign key (correction_of_event_id, challenge_id) references public.check_in_events (id, challenge_id) on delete restrict,
  check (event_type <> 'correction' or correction_of_event_id is not null),
  check (correction_of_event_id is null or correction_of_event_id <> id)
);

create unique index check_in_events_challenge_idempotency_uidx
  on public.check_in_events (challenge_id, idempotency_key)
  where idempotency_key is not null;

-- Append-only for every role, including service_role: grants alone only stop
-- untrusted clients, not a bug in trusted server code. Corrections are new
-- rows referencing correction_of_event_id; a recorded event is never edited
-- or removed.
create function public.reject_check_in_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'check_in_events is append-only: rows cannot be updated or deleted'
    using errcode = '23000';
end;
$$;

revoke execute on function public.reject_check_in_event_mutation() from public, anon, authenticated;

create trigger check_in_events_reject_update
  before update on public.check_in_events
  for each row execute function public.reject_check_in_event_mutation();
create trigger check_in_events_reject_delete
  before delete on public.check_in_events
  for each row execute function public.reject_check_in_event_mutation();

create table public.consequences (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique,
  owner_id uuid not null,
  status text not null check (status in (
    'draft', 'payment_method_required', 'authorized', 'active', 'charge_pending',
    'charged', 'reward_fulfillment_pending', 'reward_delivered', 'failed_payment',
    'canceled_before_activation'
  )),
  stake_minor_units bigint not null check (stake_minor_units > 0),
  currency text not null check (currency in ('USD')),
  authorization_status text not null default 'not_requested' check (authorization_status in ('not_requested', 'pending', 'authorized', 'failed', 'revoked')),
  authorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (challenge_id, owner_id) references public.challenges (id, owner_id) on delete restrict,
  check ((authorization_status = 'authorized' and authorized_at is not null) or authorization_status <> 'authorized')
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null,
  owner_id uuid not null,
  recipient_id uuid,
  invitation_status text not null default 'draft' check (invitation_status in ('draft', 'ready', 'sent', 'accepted', 'declined', 'replaced', 'expired')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  responded_at timestamptz,
  foreign key (challenge_id, owner_id) references public.challenges (id, owner_id) on delete restrict,
  foreign key (recipient_id, challenge_id) references public.challenge_recipients (id, challenge_id) on delete restrict,
  check (invitation_status not in ('sent', 'accepted', 'declined', 'replaced', 'expired') or sent_at is not null),
  check (invitation_status not in ('accepted', 'declined') or responded_at is not null)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete restrict,
  membership_status text not null check (membership_status in ('trialing', 'active', 'grace_period', 'expired', 'canceled_pending_expiry')),
  access_mode text not null check (access_mode in ('full', 'completion', 'none')),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.consequence_provider_references (
  consequence_id uuid primary key references public.consequences (id) on delete restrict,
  payment_provider text not null check (length(btrim(payment_provider)) > 0),
  customer_reference text,
  payment_method_reference text,
  authorization_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.consequence_charge_attempts (
  id uuid primary key default gen_random_uuid(),
  consequence_id uuid not null references public.consequences (id) on delete restrict,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 200),
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('pending', 'processing', 'succeeded', 'failed', 'requires_action', 'canceled')),
  amount_minor_units bigint not null check (amount_minor_units > 0),
  currency text not null check (currency in ('USD')),
  provider_reference text,
  failure_code text,
  failure_message text,
  requested_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (consequence_id, idempotency_key),
  unique (consequence_id, attempt_number)
);

create table private.reward_fulfillments (
  id uuid primary key default gen_random_uuid(),
  consequence_id uuid not null references public.consequences (id) on delete restrict,
  fulfillment_provider text not null check (length(btrim(fulfillment_provider)) > 0),
  provider_reference text,
  status text not null check (status in ('pending', 'processing', 'delivered', 'failed', 'canceled')),
  amount_minor_units bigint not null check (amount_minor_units > 0),
  currency text not null check (currency in ('USD')),
  requested_at timestamptz not null,
  delivered_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'delivered' and delivered_at is not null) or status <> 'delivered')
);

-- Ownership and query indexes, including columns used by RLS policies.
create index challenge_drafts_owner_idx on public.challenge_drafts (owner_id);
create index challenges_owner_idx on public.challenges (owner_id);
create index challenges_source_draft_idx on public.challenges (source_draft_id);
create index challenge_recipients_challenge_idx on public.challenge_recipients (challenge_id);
create index challenge_periods_challenge_window_idx on public.challenge_periods (challenge_id, starts_at, ends_at);
create index check_in_events_challenge_idx on public.check_in_events (challenge_id);
create index check_in_events_owner_idx on public.check_in_events (owner_id);
create index check_in_events_period_idx on public.check_in_events (period_id);
create index check_in_events_server_recorded_idx on public.check_in_events (server_recorded_at);
create index consequences_owner_idx on public.consequences (owner_id);
create index invitations_owner_idx on public.invitations (owner_id);
create index invitations_challenge_idx on public.invitations (challenge_id);
create index memberships_owner_idx on public.memberships (owner_id);
create index charge_attempts_consequence_idx on private.consequence_charge_attempts (consequence_id);
create index reward_fulfillments_consequence_idx on private.reward_fulfillments (consequence_id);

-- updated_at is mechanical only; trusted lifecycle rules remain future server responsibility.
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger challenge_drafts_set_updated_at before update on public.challenge_drafts
  for each row execute function public.set_updated_at();
create trigger challenges_protect_snapshot before update on public.challenges
  for each row execute function public.protect_activated_challenge_snapshot();
create trigger challenges_set_updated_at before update on public.challenges
  for each row execute function public.set_updated_at();
create trigger challenge_periods_set_updated_at before update on public.challenge_periods
  for each row execute function public.set_updated_at();
create trigger consequences_set_updated_at before update on public.consequences
  for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger provider_references_set_updated_at before update on private.consequence_provider_references
  for each row execute function public.set_updated_at();
create trigger reward_fulfillments_set_updated_at before update on private.reward_fulfillments
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.challenge_drafts enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_recipients enable row level security;
alter table public.challenge_periods enable row level security;
alter table public.check_in_events enable row level security;
alter table public.consequences enable row level security;
alter table public.invitations enable row level security;
alter table public.memberships enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy challenge_drafts_select_own on public.challenge_drafts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy challenge_drafts_insert_own on public.challenge_drafts for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy challenge_drafts_update_own on public.challenge_drafts for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy challenge_drafts_delete_own on public.challenge_drafts for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy challenges_select_own on public.challenges for select to authenticated
  using (owner_id = (select auth.uid()));
create policy challenge_recipients_select_parent_owner on public.challenge_recipients for select to authenticated
  using (exists (select 1 from public.challenges c where c.id = challenge_recipients.challenge_id and c.owner_id = (select auth.uid())));
create policy challenge_periods_select_parent_owner on public.challenge_periods for select to authenticated
  using (exists (select 1 from public.challenges c where c.id = challenge_periods.challenge_id and c.owner_id = (select auth.uid())));
create policy check_in_events_select_own on public.check_in_events for select to authenticated
  using (owner_id = (select auth.uid()));
create policy consequences_select_own on public.consequences for select to authenticated
  using (owner_id = (select auth.uid()));
create policy invitations_select_own on public.invitations for select to authenticated
  using (owner_id = (select auth.uid()));
create policy memberships_select_own on public.memberships for select to authenticated
  using (owner_id = (select auth.uid()));

-- Table privileges are deliberately narrower than RLS: only drafts and own profiles are client-writable.
revoke all on table public.profiles, public.challenge_drafts, public.challenges,
  public.challenge_recipients, public.challenge_periods, public.check_in_events,
  public.consequences, public.invitations, public.memberships from anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, display_name), update (display_name) on table public.profiles to authenticated;
grant select, delete on table public.challenge_drafts to authenticated;
grant insert (id, owner_id, schema_version, draft_payload, draft_status),
  update (schema_version, draft_payload, draft_status) on table public.challenge_drafts to authenticated;
grant select on table public.challenges, public.challenge_recipients,
  public.challenge_periods, public.check_in_events, public.consequences,
  public.invitations, public.memberships to authenticated;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

-- Supabase's server-only service role is reserved for future trusted functions and workers.
grant select, insert, update, delete on table public.profiles, public.challenge_drafts,
  public.challenges, public.challenge_recipients, public.challenge_periods,
  public.check_in_events, public.consequences, public.invitations,
  public.memberships to service_role;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.consequence_provider_references,
  private.consequence_charge_attempts, private.reward_fulfillments to service_role;
