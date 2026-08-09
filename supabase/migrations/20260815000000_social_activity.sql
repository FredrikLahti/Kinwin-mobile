-- Kin-only social activity. Visible to the owner and to accepted Kin only
-- (public.kin_connections status = 'accepted') — no per-post audience
-- picker in v1 (docs/PRODUCT_DECISIONS.md's social section: the hierarchy
-- stays my challenge -> relevant Kin activity -> everything else).
--
-- Rows are written only by trusted server code (the challenge_started
-- trigger below, and the finalize-challenge edge function for
-- challenge_succeeded/challenge_failed) — never by direct client insert,
-- so "I succeeded" is never taken on the client's own word. The payload is
-- a fully denormalized, pre-sanitized copy written at event-creation time
-- rather than a join exposing challenges/consequences to Kin — the
-- private tables themselves are never exposed to Kin at all, only this
-- narrow, purpose-built projection of them.

create table public.social_activity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid references public.challenges (id) on delete cascade,
  kind text not null check (kind in ('challenge_started', 'challenge_succeeded', 'challenge_failed')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

create index social_activity_owner_created_idx on public.social_activity (owner_id, created_at desc);

alter table public.social_activity enable row level security;

create policy social_activity_select_visible on public.social_activity for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.kin_connections c
      where c.status = 'accepted'
        and ((c.requester_id = (select auth.uid()) and c.recipient_id = social_activity.owner_id)
          or (c.recipient_id = (select auth.uid()) and c.requester_id = social_activity.owner_id))
    )
  );

-- No direct client writes: activity is always server-asserted (see the
-- trigger below and the finalize-challenge edge function).
revoke all on public.social_activity from public, anon, authenticated;
grant select on public.social_activity to authenticated;
grant select, insert, update, delete on public.social_activity to service_role;

-- A small, fixed reaction taxonomy supporting both encouragement (respect,
-- nice) and playful roasting (ouch, brutal) plus a neutral "worth it" that
-- fits either a success or a failure moment — deliberately not a copy of
-- any earlier prototype's exact label set, and deliberately not a
-- like-only system (too generic for a product whose whole point is that
-- failure is visible and reactions can be funny, not just approving).
create table public.activity_reactions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.social_activity (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('respect', 'nice', 'worth_it', 'ouch', 'brutal')),
  created_at timestamptz not null default now(),
  unique (activity_id, user_id)
);

create index activity_reactions_activity_idx on public.activity_reactions (activity_id);

alter table public.activity_reactions enable row level security;

-- Mirrors social_activity's own visibility exactly, via the same join: a
-- reaction is visible to anyone who can see the activity it's on.
create policy activity_reactions_select_visible on public.activity_reactions for select to authenticated
  using (
    exists (
      select 1 from public.social_activity a
      where a.id = activity_reactions.activity_id
        and (a.owner_id = (select auth.uid())
          or exists (
            select 1 from public.kin_connections c
            where c.status = 'accepted'
              and ((c.requester_id = (select auth.uid()) and c.recipient_id = a.owner_id)
                or (c.recipient_id = (select auth.uid()) and c.requester_id = a.owner_id))
          ))
    )
  );

-- A user may only ever react as themselves, and only on activity they are
-- already authorized to see (same visibility check as select).
create policy activity_reactions_insert_own on public.activity_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.social_activity a
      where a.id = activity_reactions.activity_id
        and (a.owner_id = (select auth.uid())
          or exists (
            select 1 from public.kin_connections c
            where c.status = 'accepted'
              and ((c.requester_id = (select auth.uid()) and c.recipient_id = a.owner_id)
                or (c.recipient_id = (select auth.uid()) and c.requester_id = a.owner_id))
          ))
    )
  );

create policy activity_reactions_delete_own on public.activity_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.activity_reactions from public, anon, authenticated;
grant select, insert, delete on public.activity_reactions to authenticated;
grant select, insert, update, delete on public.activity_reactions to service_role;

-- Generates the one activity event this package derives directly from an
-- existing, already-tested state transition rather than a new edge
-- function: activation. Deliberately implemented as an AFTER UPDATE
-- trigger rather than editing activate_challenge_draft's body
-- (20260811000000_full_activation.sql) — additive and low-risk against an
-- already-tested function. on conflict makes it safe to run twice.
create or replace function private.record_challenge_started_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.challenge_status = 'active' and old.challenge_status is distinct from 'active' then
    insert into public.social_activity (owner_id, challenge_id, kind, payload, dedupe_key)
    values (
      new.owner_id, new.id, 'challenge_started',
      jsonb_build_object('behavior', new.activation_snapshot -> 'behavior'),
      'started:' || new.id::text
    )
    on conflict (owner_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function private.record_challenge_started_activity() from public, anon, authenticated;

create trigger challenges_record_started_activity
  after update on public.challenges
  for each row execute function private.record_challenge_started_activity();
