-- V1 social interaction model: emoji reactions replace the old word-based
-- vocabulary, and lightweight flat comments are added — the approved
-- follow-up to the Activity/reaction product-design review (the founder's
-- physical-beta complaint that a permanently-visible row of five labeled
-- buttons — Respect/Nice/Worth it/Ouch/Brutal — read as Kinwin prescribing
-- how friends are allowed to respond, not real friends interacting).
--
-- Two independent pieces, both additive to 20260815000000_social_activity.sql:
--
-- 1. activity_reactions.kind's persisted vocabulary changes from five
--    branded words to five standard Unicode emoji. This is a
--    representation change, not a new catalog/domain system — the emoji
--    character itself is the stored value, exactly as simple and explicit
--    as the word it replaces.
--
-- 2. A new, flat (no threading, no replies) activity_comments table for
--    real, user-authored short text — the actual carrier of
--    friendship-specific tone ("You've got the next one" vs "Book the
--    restaurant, you idiot") that a fixed reaction vocabulary can never
--    produce. Visibility mirrors social_activity/activity_reactions'
--    existing Kin-only RLS exactly; content passes through the same
--    private.assert_social_content_allowed boundary already used for
--    display_name and challenge activation text
--    (20260902000000_social_reports_and_content_filter.sql) — no second
--    content-safety system.

-- ---------------------------------------------------------------------
-- Part 1: reaction vocabulary — words to emoji
-- ---------------------------------------------------------------------

-- Existing rows under the old word vocabulary have no faithful 1:1 emoji
-- equivalent ("worth_it" in particular has no honest single-emoji
-- translation) — reinterpreting them would misrepresent what the reacting
-- user actually chose. This product has not yet deployed past hosted
-- TEST (see docs/LAUNCH_READINESS.md), so there is no real production
-- reaction data to preserve; the deterministic, honest choice is to drop
-- the old rows rather than silently relabel them. This is a one-time
-- compatibility step for this exact vocabulary swap, not a general pattern.
delete from public.activity_reactions
  where kind not in ('🔥', '❤️', '😂', '😬', '👑');

alter table public.activity_reactions drop constraint if exists activity_reactions_kind_check;
alter table public.activity_reactions
  add constraint activity_reactions_kind_check check (kind in ('🔥', '❤️', '😂', '😬', '👑'));

-- ---------------------------------------------------------------------
-- Part 2: activity_comments — flat, short, Kin-only
-- ---------------------------------------------------------------------

create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.social_activity (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  -- Trimmed, non-empty, capped at 200 chars — enforced here as the one
  -- source of truth rather than only in the client, exactly like every
  -- other content boundary in this schema (e.g. social_reports.detail's
  -- own length check).
  body text not null check (length(btrim(body)) > 0 and length(body) <= 200),
  -- A denormalized, server-written snapshot of the author's display name at
  -- comment-creation time — the same pattern social_activity.payload
  -- already uses for challenge facts. Exists because comment visibility is
  -- audience-of-the-activity-owner, not audience-of-each-other: two Kin who
  -- both know the activity's owner but are not Kin with each other (see
  -- private.enforce_comment_content_policy below) can legitimately see one
  -- another's comments without either gaining generic profiles access to
  -- the other. Always overwritten server-side by the BEFORE INSERT trigger
  -- below regardless of what a client sends — never client-trusted.
  author_display_name text not null,
  created_at timestamptz not null default now()
);

create index activity_comments_activity_created_idx on public.activity_comments (activity_id, created_at);
create index activity_comments_author_idx on public.activity_comments (author_id);

alter table public.activity_comments enable row level security;

-- Visibility mirrors activity_reactions_select_visible exactly (same join,
-- same accepted-Kin-or-owner rule) — a comment is visible to anyone who can
-- already see the activity it's on, never a separate privacy model.
create policy activity_comments_select_visible on public.activity_comments for select to authenticated
  using (
    exists (
      select 1 from public.social_activity a
      where a.id = activity_comments.activity_id
        and (a.owner_id = (select auth.uid())
          or exists (
            select 1 from public.kin_connections c
            where c.status = 'accepted'
              and ((c.requester_id = (select auth.uid()) and c.recipient_id = a.owner_id)
                or (c.recipient_id = (select auth.uid()) and c.requester_id = a.owner_id))
          ))
    )
  );

-- A user may only ever author a comment as themselves (client cannot forge
-- author_id — RLS enforces this server-side regardless of what a request
-- body claims), and only on activity they are already authorized to see —
-- same visibility check as select, matching activity_reactions_insert_own's
-- own pattern. Content safety is enforced separately by the BEFORE INSERT
-- trigger below (RLS's WITH CHECK cannot call
-- private.assert_social_content_allowed directly: that function is
-- deliberately not executable by authenticated, only reachable through a
-- SECURITY DEFINER trigger — the same reason
-- enforce_display_name_content_policy is a trigger and not an inline RLS
-- expression).
create policy activity_comments_insert_own on public.activity_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.social_activity a
      where a.id = activity_comments.activity_id
        and (a.owner_id = (select auth.uid())
          or exists (
            select 1 from public.kin_connections c
            where c.status = 'accepted'
              and ((c.requester_id = (select auth.uid()) and c.recipient_id = a.owner_id)
                or (c.recipient_id = (select auth.uid()) and c.requester_id = a.owner_id))
          ))
    )
  );

-- Deletion: the comment's own author, OR the owner of the activity it was
-- posted on (removing an unwanted comment from their own moment without
-- needing to block/report the commenter) — the two actors the founder
-- explicitly approved. A single DELETE policy expresses both without a
-- second RPC. Hard delete, not a soft "hidden" flag: matches
-- private.social_reports' own established precedent of treating
-- reported_activity_id as an opaque historical reference rather than a
-- live foreign key (20260902000000_social_reports_and_content_filter.sql)
-- — a report referencing a since-deleted comment is unaffected either way,
-- and no moderation-history table is introduced here.
create policy activity_comments_delete_own_or_activity_owner on public.activity_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.social_activity a
      where a.id = activity_comments.activity_id and a.owner_id = (select auth.uid())
    )
  );

-- No update policy: comments are never edited in V1 (out of scope — no
-- edit history), only posted or deleted.
revoke all on public.activity_comments from public, anon, authenticated;
grant select, insert, delete on public.activity_comments to authenticated;
grant select, insert, update, delete on public.activity_comments to service_role;

-- Two independent jobs on the same BEFORE INSERT trigger, both requiring
-- SECURITY DEFINER for the same reason: neither private.
-- assert_social_content_allowed nor public.profiles' own row (when the
-- author isn't visible to themselves via some other already-granted path)
-- can be reached by an ordinary `authenticated` caller's own privileges.
--
-- 1. Reuses the exact same trusted content-filter primitive already
--    enforced on profiles.display_name and challenge activation text — no
--    second profanity/content system for comments.
-- 2. Snapshots the author's current display name onto the comment row,
--    always overwriting whatever (if anything) the client sent for
--    author_display_name — a client can never forge another identity, and
--    a client-omitted value still gets a real one. This is what lets a
--    comment's audience (anyone who can see the activity it's on) learn who
--    wrote it without ever being granted generic public.profiles access to
--    that author — narrower than broadening profiles_select_kin to
--    Kin-of-Kin, and consistent with social_activity's own existing
--    denormalized-facts pattern. A null/blank display_name falls back to
--    the same 'Your Kin' string the client already uses everywhere else a
--    name is unknown (see lib/supabase/kin-repository.ts).
create or replace function private.enforce_comment_content_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  perform private.assert_social_content_allowed(new.body, 'comment');

  select coalesce(nullif(btrim(display_name), ''), 'Your Kin') into v_display_name
    from public.profiles where id = new.author_id;
  new.author_display_name := coalesce(v_display_name, 'Your Kin');

  return new;
end;
$$;

revoke execute on function private.enforce_comment_content_policy() from public, anon, authenticated;

create trigger activity_comments_enforce_content_policy before insert on public.activity_comments
  for each row execute function private.enforce_comment_content_policy();

-- ---------------------------------------------------------------------
-- Part 3: reporting — extend submit_social_report to cover comments
-- ---------------------------------------------------------------------

-- Historical, opaque reference only — same rationale as reported_activity_id
-- just above it: never a live FK, so deleting the referenced comment (via
-- either delete actor above) can never fail or corrupt a report row.
alter table private.social_reports add column reported_comment_id uuid;

-- The old partial unique index only ever considered reported_activity_id as
-- the non-profile target; a comment report needs to be its own distinct
-- dedupe target (a reporter reporting both a Kin's activity item AND a
-- separate comment on it are two different reports, not duplicates of each
-- other) rather than colliding on the same "no activity id" sentinel a
-- profile-level report already uses.
drop index if exists private.social_reports_reporter_target_open_unique;
create unique index social_reports_reporter_target_open_unique on private.social_reports (
  reporter_user_id, reported_user_id,
  coalesce(reported_activity_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(reported_comment_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'open';

create index social_reports_reported_comment_idx on private.social_reports (reported_comment_id) where reported_comment_id is not null;

-- Re-defined (not edited in place) to add an optional comment target,
-- mutually exclusive with the existing activity target. A comment report's
-- authorization check mirrors activity_comments_select_visible exactly —
-- the caller must already be able to see the comment (via the activity it's
-- on) — and additionally re-verifies the caller's claimed reported_user_id
-- actually matches that comment's real author, so a caller can never report
-- person X while pointing at a comment that was actually written by someone
-- else.
create or replace function public.submit_social_report(
  p_reported_user_id uuid,
  p_reported_activity_id uuid default null,
  p_reason text default null,
  p_detail text default null,
  p_reported_comment_id uuid default null
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
  v_comment_author uuid;
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
  if p_reported_activity_id is not null and p_reported_comment_id is not null then
    raise exception 'report exactly one target' using errcode = '22023';
  end if;

  if p_reported_comment_id is not null then
    select c.author_id into v_comment_author
      from public.activity_comments c
      join public.social_activity a on a.id = c.activity_id
      where c.id = p_reported_comment_id
        and (a.owner_id = caller
          or exists (
            select 1 from public.kin_connections k
            where k.status = 'accepted'
              and ((k.requester_id = caller and k.recipient_id = a.owner_id)
                or (k.recipient_id = caller and k.requester_id = a.owner_id))
          ));
    if v_comment_author is null then
      raise exception 'that comment could not be found' using errcode = 'P0002';
    end if;
    if v_comment_author <> p_reported_user_id then
      raise exception 'that comment was not posted by the reported person' using errcode = '22023';
    end if;
  elsif p_reported_activity_id is not null then
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

  insert into private.social_reports (reporter_user_id, reported_user_id, reported_activity_id, reported_comment_id, reason, detail)
    values (caller, p_reported_user_id, p_reported_activity_id, p_reported_comment_id, p_reason, v_detail)
  on conflict (
    reporter_user_id, reported_user_id,
    coalesce(reported_activity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(reported_comment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'open'
  do nothing
  returning id into v_report_id;

  if v_report_id is null then
    return jsonb_build_object('status', 'already_reported');
  end if;
  return jsonb_build_object('status', 'submitted');
end;
$$;

revoke all on function public.submit_social_report(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_social_report(uuid, uuid, text, text, uuid) to authenticated;

-- The old 4-argument overload no longer exists once replaced above (Postgres
-- function replacement with a changed signature creates a new overload
-- rather than mutating the old one) — drop it explicitly so exactly one
-- version of submit_social_report is ever callable.
drop function if exists public.submit_social_report(uuid, uuid, text, text);

-- ---------------------------------------------------------------------
-- Part 4: account deletion must also remove comments this owner authored
-- on someone ELSE's activity
-- ---------------------------------------------------------------------

-- Deleting public.social_activity where owner_id = p_owner_id (already
-- present below, unchanged) already cascades away every comment ON that
-- owner's own activity, authored by anyone — activity_comments.activity_id
-- has ON DELETE CASCADE into social_activity. What that cascade does NOT
-- reach is a comment this owner wrote on a *different* person's activity:
-- that row's activity_id points at a social_activity row that still exists
-- and isn't being deleted, so only an explicit `author_id = p_owner_id`
-- delete removes it. Without this, such a comment would depend entirely on
-- the later auth.admin.deleteUser(...) call's own FK cascade — but that
-- call happens in a separate step, after this function's transaction has
-- already committed (see 20260903000000_account_deletion.sql's own header
-- on why owned-data deletion and the Auth Admin call are necessarily two
-- separate steps). If the Admin API call then failed, the comment would
-- keep showing on the other person's Activity — still attributed to a
-- "deleted" account — even though every other trace of this owner's data
-- was already gone. Full-body replace: everything below is identical to
-- 20260904000000_account_deletion_service_role_rpc_and_locking.sql's own
-- version of this function except the one new
-- `delete from public.activity_comments where author_id = p_owner_id`
-- line, placed alongside the other "this owner's own contributions
-- elsewhere" cleanup (activity_reactions), before social_activity's own
-- cascade-triggering delete.
create or replace function private.delete_account_owned_data(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_challenge_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('kinwin_account_mutation'), hashtext(p_owner_id::text));

  v_reason := private.account_deletion_blocker(p_owner_id);
  if v_reason is not null then
    raise exception '%', v_reason using errcode = '22023';
  end if;

  select coalesce(array_agg(id), '{}') into v_challenge_ids
    from public.challenges where owner_id = p_owner_id;

  perform set_config('kinwin.allow_owned_data_deletion', 'on', true);

  delete from private.reward_link_access_events e
    using public.invitations i
    where e.invitation_id = i.id and i.challenge_id = any(v_challenge_ids);

  delete from private.reward_fulfillments f
    using public.consequences co
    where f.consequence_id = co.id and co.challenge_id = any(v_challenge_ids);

  delete from private.consequence_setup_attempts a
    using public.consequences co
    where a.consequence_id = co.id and co.challenge_id = any(v_challenge_ids);

  delete from private.consequence_charge_attempts a
    using public.consequences co
    where a.consequence_id = co.id and co.challenge_id = any(v_challenge_ids);

  delete from private.consequence_provider_references r
    using public.consequences co
    where r.consequence_id = co.id and co.challenge_id = any(v_challenge_ids);

  delete from public.invitations where challenge_id = any(v_challenge_ids);
  delete from public.consequences where challenge_id = any(v_challenge_ids);
  delete from public.challenge_reward_organizers where challenge_id = any(v_challenge_ids);

  loop
    delete from public.check_in_events e
      where e.challenge_id = any(v_challenge_ids)
        and not exists (select 1 from public.check_in_events child where child.correction_of_event_id = e.id);
    exit when not found;
  end loop;

  delete from public.challenge_periods where challenge_id = any(v_challenge_ids);
  delete from public.challenge_recipients where challenge_id = any(v_challenge_ids);
  delete from private.challenge_period_generations where challenge_id = any(v_challenge_ids);

  update private.challenge_completion_worker_failures
    set challenge_id = null where challenge_id = any(v_challenge_ids);

  delete from public.playbook_entries where source_challenge_id = any(v_challenge_ids);
  delete from public.challenges where owner_id = p_owner_id;
  delete from public.challenge_drafts where owner_id = p_owner_id;

  perform set_config('kinwin.allow_owned_data_deletion', 'off', true);

  delete from public.kin_connections where requester_id = p_owner_id or recipient_id = p_owner_id;
  delete from public.activity_reactions where user_id = p_owner_id;
  -- New: comments this owner wrote on someone else's activity. Comments on
  -- this owner's OWN activity are handled by the social_activity cascade
  -- two lines below, regardless of who wrote them.
  delete from public.activity_comments where author_id = p_owner_id;
  delete from public.social_activity where owner_id = p_owner_id;
  delete from public.playbook_entries where owner_id = p_owner_id;
  delete from private.stripe_customers where owner_id = p_owner_id;
  delete from public.memberships where owner_id = p_owner_id;
  delete from public.profiles where id = p_owner_id;
end;
$$;

revoke all on function private.delete_account_owned_data(uuid) from public, anon, authenticated;
grant execute on function private.delete_account_owned_data(uuid) to service_role;
