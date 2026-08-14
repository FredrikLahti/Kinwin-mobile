-- Minimal external-beta UGC safety for the real, shipped Kin/social layer
-- (kin_connections, social_activity, activity_reactions,
-- profiles.display_name). Two independent pieces:
--
-- 1. A trusted, server-side content filter at the exact points where
--    user-authored free text becomes visible to another real person:
--    profiles.display_name (any Kin, or search), and the challenge
--    behavior/completion-definition/recipient-name text captured once into
--    challenges.activation_snapshot at activation and copied from there
--    into social_activity's payload (challenge_started/succeeded/failed).
--    Deliberately narrow -- a small deny-list is not a real moderation
--    system and cannot understand context or every language. It exists to
--    reject obvious, unambiguous profanity/harassment before it's ever
--    written, not to police Kinwin's normal friendly-roasting tone.
--    Hate-speech-specific slurs are intentionally NOT hardcoded into this
--    list -- a maintained term list for that is a separate, real decision
--    (licensing/curation, kept current) that this MVP pass does not make;
--    see docs/LAUNCH_READINESS.md for that gap stated plainly.
--
-- 2. A minimal, secure report table (private.social_reports) and a single
--    SECURITY DEFINER RPC (public.submit_social_report) a caller can use to
--    report another person's visible activity or profile. Nothing in
--    `private` is ever reachable directly by authenticated/anon (schema-
--    level revoke already in 20260803000000_initial_kinwin_schema.sql) --
--    every read/write goes through this one trusted function, exactly like
--    every other private table in this schema.

-- ---------------------------------------------------------------------
-- Part 1: trusted content filter
-- ---------------------------------------------------------------------

-- Word-boundary, case-insensitive match against a small, fixed deny-list.
-- Pure and side-effect-free by design so it can be reused anywhere text
-- needs checking, including directly in a WHERE/CHECK expression later.
create or replace function private.contains_disallowed_content(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is not null and exists (
    select 1
    from unnest(array[
      'fuck', 'motherfucker', 'shit', 'bitch', 'cunt', 'asshole', 'bastard',
      'whore', 'slut', 'dickhead', 'retard', 'kill yourself', 'kys'
    ]) as term
    where p_text ~* ('(?<![[:alnum:]])' || term || '(?![[:alnum:]])')
  );
$$;

revoke execute on function private.contains_disallowed_content(text) from public, anon, authenticated;

-- Raises a neutral, field-labeled validation error -- never silently
-- mutates the text into something else (that would misrepresent what the
-- user actually wrote), always a hard rejection instead.
create or replace function private.assert_social_content_allowed(p_text text, p_field text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if private.contains_disallowed_content(p_text) then
    raise exception 'This % is not allowed. Please rephrase and try again.', p_field using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.assert_social_content_allowed(text, text) from public, anon, authenticated;

-- Enforced at the one real write boundary: profiles.display_name is
-- client-writable directly (see the column-scoped grant in
-- 20260803000000_initial_kinwin_schema.sql) and visible to any Kin
-- (pending or accepted -- profiles_select_kin) as well as to anyone via
-- search_kin_candidates. SECURITY DEFINER so it can reach the private
-- schema regardless of the caller's own (much narrower) grants.
create or replace function private.enforce_display_name_content_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.display_name is not null then
      perform private.assert_social_content_allowed(new.display_name, 'display name');
    end if;
  elsif new.display_name is distinct from old.display_name and new.display_name is not null then
    perform private.assert_social_content_allowed(new.display_name, 'display name');
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_display_name_content_policy() from public, anon, authenticated;

create trigger profiles_enforce_display_name_content_policy before insert or update on public.profiles
  for each row execute function private.enforce_display_name_content_policy();

-- Re-defined (not edited in place) to add content validation before the
-- one and only place challenge behavior/completion-definition/recipient-
-- name text is ever copied out of a private draft/challenge row into
-- something Kin can read. activation_snapshot is immutable once set
-- (challenges_protect_snapshot, same original migration), so validating
-- here, once, at the moment social_activity first becomes possible for
-- this challenge, is sufficient for the rest of the challenge's lifetime
-- -- finalize_challenge_result later reuses this same already-validated
-- snapshotJson.behavior/recipients (see supabase/functions/_shared/
-- challenge-completion/finalize.ts), never re-reads new user input.
-- Raising here aborts the whole activate_challenge_draft call atomically
-- (same transaction) -- a challenge with disallowed shared text never
-- reaches 'active' at all, not just "isn't posted socially."
create or replace function private.record_challenge_started_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_behavior jsonb;
  v_recipient jsonb;
begin
  if new.challenge_status = 'active' and old.challenge_status is distinct from 'active' then
    v_behavior := new.activation_snapshot -> 'behavior';
    perform private.assert_social_content_allowed(v_behavior ->> 'description', 'challenge description');
    perform private.assert_social_content_allowed(v_behavior ->> 'completionDefinition', 'completion definition');

    for v_recipient in select jsonb_array_elements(coalesce(new.activation_snapshot -> 'recipients', '[]'::jsonb))
    loop
      perform private.assert_social_content_allowed(v_recipient ->> 'name', 'recipient name');
    end loop;

    insert into public.social_activity (owner_id, challenge_id, kind, payload, dedupe_key)
    values (
      new.owner_id, new.id, 'challenge_started',
      jsonb_build_object('behavior', v_behavior),
      'started:' || new.id::text
    )
    on conflict (owner_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Part 2: minimal reporting
-- ---------------------------------------------------------------------

create table private.social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  -- Nullable: a report can be about a specific piece of activity, or about
  -- the person/profile generally (e.g. reported from the People tab, not
  -- tied to one activity item). Deliberately NOT a foreign key into
  -- social_activity: existence/visibility is already re-validated inside
  -- submit_social_report at the moment of submission (below), so this
  -- column only ever needs to be a historical, opaque reference from that
  -- point on -- a report's identity must never be mutated by something
  -- else's later lifecycle (e.g. the referenced activity row being
  -- deleted), and a live FK would do exactly that (see the note on the
  -- partial unique index just below for the concrete collision this
  -- avoids). No archive/retention model is introduced here -- how long a
  -- report itself is kept remains RETENTION DECISION NEEDED, same as
  -- everywhere else in docs/PRIVACY_DATA_INVENTORY.md.
  reported_activity_id uuid,
  reason text not null check (reason in ('harassment', 'hate_or_abuse', 'sexual_content', 'spam', 'other')),
  detail text check (detail is null or length(detail) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (reporter_user_id <> reported_user_id),
  check (status = 'open' or resolved_at is not null),
  check (status <> 'open' or resolved_at is null)
);

-- Prevents duplicate-click spam, not future incidents: only one OPEN report
-- for the same reporter + exact target (activity-specific reports and
-- profile-level reports are distinct targets, via the same coalesce-to-a-
-- sentinel trick used elsewhere for "nullable column, unique together"). A
-- partial index, not a plain one -- once a report is resolved/dismissed, a
-- genuinely new report against the same target is allowed again, rather
-- than being permanently blocked. Being a partial index over `status =
-- 'open'` rather than a live FK is also what makes reported_activity_id
-- safe to have no foreign key above: nothing about deleting a
-- social_activity row can ever touch this index or this table at all.
create unique index social_reports_reporter_target_open_unique on private.social_reports (
  reporter_user_id, reported_user_id, coalesce(reported_activity_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'open';
-- The actual operational review query: open reports, oldest first.
create index social_reports_status_created_idx on private.social_reports (status, created_at);
create index social_reports_reported_user_idx on private.social_reports (reported_user_id);

alter table private.social_reports enable row level security;

-- No policies granted to authenticated/anon on purpose -- every access
-- goes through submit_social_report below (insert) or a direct service_role
-- session (operational review, see docs/LAUNCH_READINESS.md). Matches every
-- other table in this schema: revoke all from public, anon, authenticated
-- already applies schema-wide (20260803000000_initial_kinwin_schema.sql).
grant select, insert, update, delete on table private.social_reports to service_role;

-- The one client-reachable entrypoint. Reports either a specific activity
-- item (validated against the exact same visibility rule social_activity's
-- own RLS already enforces -- owner or accepted Kin) or, if
-- p_reported_activity_id is omitted, the person's profile -- gated on the
-- exact same visibility rule profiles_select_kin already uses (pending or
-- accepted; not a stale 'removed' or 'blocked' row), so a profile-level
-- report can never target someone whose profile isn't actually visible
-- through the real Kin UI in the first place. Deliberately does not cover
-- person-search results (search_kin_candidates) -- out of scope for this
-- pass.
create or replace function public.submit_social_report(
  p_reported_user_id uuid,
  p_reported_activity_id uuid default null,
  p_reason text default null,
  p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_detail text;
  v_report_id uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_reported_user_id is null or p_reported_user_id = caller then
    raise exception 'a valid other person is required' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('harassment', 'hate_or_abuse', 'sexual_content', 'spam', 'other') then
    raise exception 'a valid reason is required' using errcode = '22023';
  end if;

  if p_reported_activity_id is not null then
    if not exists (
      select 1 from public.social_activity a
      where a.id = p_reported_activity_id
        and a.owner_id = p_reported_user_id
        and (a.owner_id = caller
          or exists (
            select 1 from public.kin_connections c
            where c.status = 'accepted'
              and ((c.requester_id = caller and c.recipient_id = a.owner_id)
                or (c.recipient_id = caller and c.requester_id = a.owner_id))
          ))
    ) then
      raise exception 'that activity could not be found' using errcode = 'P0002';
    end if;
  else
    if not exists (
      select 1 from public.kin_connections c
      where least(c.requester_id, c.recipient_id) = least(caller, p_reported_user_id)
        and greatest(c.requester_id, c.recipient_id) = greatest(caller, p_reported_user_id)
        and c.status in ('pending', 'accepted')
    ) then
      raise exception 'that person could not be found' using errcode = 'P0002';
    end if;
  end if;

  v_detail := nullif(btrim(coalesce(p_detail, '')), '');
  if v_detail is not null and length(v_detail) > 500 then
    v_detail := left(v_detail, 500);
  end if;

  insert into private.social_reports (reporter_user_id, reported_user_id, reported_activity_id, reason, detail)
    values (caller, p_reported_user_id, p_reported_activity_id, p_reason, v_detail)
  on conflict (reporter_user_id, reported_user_id, coalesce(reported_activity_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open'
  do nothing
  returning id into v_report_id;

  -- Report ids are operator/service_role-only detail (see private.social_reports'
  -- own grants below) -- never handed back to an ordinary authenticated
  -- caller, who has no product reason to know it and no way to use it.
  if v_report_id is null then
    return jsonb_build_object('status', 'already_reported');
  end if;
  return jsonb_build_object('status', 'submitted');
end;
$$;

revoke all on function public.submit_social_report(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_social_report(uuid, uuid, text, text) to authenticated;
