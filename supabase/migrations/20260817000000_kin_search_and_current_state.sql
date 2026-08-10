-- Physical-device follow-up on the Kin/Social foundation
-- (20260814000000_kin_connections.sql, 20260815000000_social_activity.sql):
-- two real product gaps found in testing.
--
-- 1. Manual kin_code entry felt artificial as the PRIMARY add-Kin flow.
--    kin_code itself is not removed -- it remains a real, working invite
--    identifier (the Share-your-code path, and a future deep-link
--    mechanism) -- but the app should offer person search by name/email
--    first. redeem_kin_code and the new name/email flow now share one
--    state-machine implementation (private.create_or_reuse_kin_request)
--    so both stay in sync automatically.
--
-- 2. A newly accepted Kin whose partner already had an active challenge
--    saw an empty Activity tab -- not a bug in the trigger, but a real
--    architectural gap: `challenges` never had a Kin-visibility RLS policy
--    at all (only `challenges_select_own`), and `challenge_started`
--    activity is only ever generated at the moment of activation, so a
--    challenge that predates the Kin relationship (or predates this whole
--    feature) never produced -- and must never retroactively fake -- a
--    `challenge_started` event with today's timestamp. The fix is a
--    architectural split, not a backfilled event: CURRENT KIN STATE
--    (get_kin_current_challenges, below -- "what is my Kin doing right
--    now") is a different question from SOCIAL EVENTS (social_activity --
--    "what just happened"), answered by a different, narrowly-scoped read
--    path. No historical completed/failed challenge data is exposed by
--    this -- only ever the CURRENT `active` challenge, and only to
--    ACCEPTED Kin.

-- Shared by redeem_kin_code and send_kin_request: the actual
-- pending/accepted/removed/blocked state-machine transition, keyed by the
-- two user ids rather than by a code. See 20260814000000_kin_connections.sql's
-- original redeem_kin_code for the design rationale (reuse a 'removed' row,
-- refuse a 'blocked' pair outright, idempotent on an already-pending or
-- already-accepted pair).
create or replace function private.create_or_reuse_kin_request(p_caller uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.kin_connections%rowtype;
  v_connection_id uuid;
begin
  if p_target = p_caller then
    raise exception 'you cannot add yourself' using errcode = '22023';
  end if;

  select * into v_existing from public.kin_connections
    where least(requester_id, recipient_id) = least(p_caller, p_target)
      and greatest(requester_id, recipient_id) = greatest(p_caller, p_target)
    for update;

  if found then
    if v_existing.status = 'blocked' then
      raise exception 'this connection is not available' using errcode = '22023';
    end if;
    if v_existing.status = 'accepted' then
      return jsonb_build_object('status', 'already_kin', 'connectionId', v_existing.id);
    end if;
    if v_existing.status = 'pending' then
      return jsonb_build_object('status', 'already_pending', 'connectionId', v_existing.id);
    end if;
    update public.kin_connections
      set status = 'pending', requester_id = p_caller, recipient_id = p_target, blocked_by = null
      where id = v_existing.id;
    return jsonb_build_object('status', 'requested', 'connectionId', v_existing.id);
  end if;

  insert into public.kin_connections (requester_id, recipient_id, status)
    values (p_caller, p_target, 'pending')
    returning id into v_connection_id;
  return jsonb_build_object('status', 'requested', 'connectionId', v_connection_id);
end;
$$;

revoke execute on function private.create_or_reuse_kin_request(uuid, uuid) from public, anon, authenticated;

-- Re-defined to delegate to the shared helper above -- same external
-- contract and error codes as before, only the internal implementation
-- changed.
create or replace function public.redeem_kin_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_owner_id uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(length(btrim(p_code)), 0) = 0 then
    raise exception 'a code is required' using errcode = '22023';
  end if;

  select id into v_owner_id from public.profiles where kin_code = upper(btrim(p_code));
  if v_owner_id is null then
    raise exception 'no Kin found for that code' using errcode = 'P0002';
  end if;

  return private.create_or_reuse_kin_request(caller, v_owner_id);
end;
$$;

-- Sends a request directly to a known user id -- the counterpart used by
-- the new search-based Add Kin flow (search_kin_candidates below finds the
-- id; this sends the request to it).
create or replace function public.send_kin_request(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_user_id is null then
    raise exception 'a user is required' using errcode = '22023';
  end if;
  return private.create_or_reuse_kin_request(caller, p_user_id);
end;
$$;

revoke all on function public.send_kin_request(uuid) from public, anon, authenticated;
grant execute on function public.send_kin_request(uuid) to authenticated;

-- Person search: the real primary Add-Kin flow. Not a directory --
-- results are capped small, and the two supported query shapes are
-- deliberately asymmetric:
--   - a query that looks like an email is matched EXACTLY (case-
--     insensitive) against auth.users.email, never partial/prefix -- a
--     partial email match would let someone enumerate other users'
--     addresses one character at a time.
--   - anything else is matched as a case-insensitive PREFIX against
--     profiles.display_name (display names are not secret; unlike email,
--     prefix matching them is the actual point of person search).
-- Returns only what is needed to identify someone and choose an action:
-- never the searched-for email value itself, never anything about their
-- challenges/activity/payment state.
create or replace function public.search_kin_candidates(p_query text)
returns table (
  id uuid,
  display_name text,
  connection_status text,
  connection_direction text,
  connection_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_query text := btrim(p_query);
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(length(v_query), 0) < 2 then
    return;
  end if;

  if v_query ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return query
      select
        p.id,
        p.display_name,
        coalesce(c.status, 'none') as connection_status,
        case when c.requester_id = caller then 'outgoing' when c.recipient_id = caller then 'incoming' else null end as connection_direction,
        c.id as connection_id
      from auth.users u
      join public.profiles p on p.id = u.id
      left join public.kin_connections c
        on least(c.requester_id, c.recipient_id) = least(caller, p.id)
        and greatest(c.requester_id, c.recipient_id) = greatest(caller, p.id)
      where lower(u.email) = lower(v_query) and p.id <> caller
      limit 1;
    return;
  end if;

  return query
    select
      p.id,
      p.display_name,
      coalesce(c.status, 'none') as connection_status,
      case when c.requester_id = caller then 'outgoing' when c.recipient_id = caller then 'incoming' else null end as connection_direction,
      c.id as connection_id
    from public.profiles p
    left join public.kin_connections c
      on least(c.requester_id, c.recipient_id) = least(caller, p.id)
      and greatest(c.requester_id, c.recipient_id) = greatest(caller, p.id)
    where p.display_name ilike (v_query || '%') and p.id <> caller and p.display_name is not null
    order by p.display_name
    limit 8;
end;
$$;

revoke all on function public.search_kin_candidates(text) from public, anon, authenticated;
grant execute on function public.search_kin_candidates(text) to authenticated;

-- Current Kin state: "what is my Kin doing right now", never "what just
-- happened" (that's social_activity). Only the caller's ACCEPTED Kin's
-- CURRENTLY active challenge -- never a completed/failed one, never a
-- stranger's. This is what makes an already-active challenge visible to a
-- newly accepted Kin immediately, without any fabricated event. Returns
-- only the same safe, denormalized fields social_activity's own payload
-- uses (behavior, duration, dates) -- never consequence/stake/payment/
-- recipient data, which the current-state view has no product reason to
-- show at all.
create or replace function public.get_kin_current_challenges()
returns table (
  owner_id uuid,
  challenge_id uuid,
  behavior jsonb,
  duration jsonb,
  starts_at timestamptz,
  planned_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  return query
    select c.owner_id, c.id as challenge_id,
      c.activation_snapshot -> 'behavior' as behavior,
      c.activation_snapshot -> 'duration' as duration,
      c.starts_at, c.planned_ends_at
    from public.challenges c
    where c.challenge_status = 'active'
      and c.owner_id <> caller
      and exists (
        select 1 from public.kin_connections k
        where k.status = 'accepted'
          and ((k.requester_id = caller and k.recipient_id = c.owner_id)
            or (k.recipient_id = caller and k.requester_id = c.owner_id))
      );
end;
$$;

revoke all on function public.get_kin_current_challenges() from public, anon, authenticated;
grant execute on function public.get_kin_current_challenges() to authenticated;
