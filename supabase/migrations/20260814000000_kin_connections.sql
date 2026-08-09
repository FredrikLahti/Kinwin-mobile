-- Kin: the real mutual, accepted connection model behind Kinwin's social
-- layer (docs/PRODUCT_DECISIONS.md's "Future Home direction" note, now
-- being built for real). Not a public follower graph: person A shares
-- their own short kin_code, person B redeems it (sends a request), A
-- accepts, and only then can challenge activity ever become visible
-- between them. No searchable directory of users exists anywhere.

alter table public.profiles add column kin_code text unique;

-- 8 chars from a 32-symbol alphabet with 0/O/1/I/l removed (easy to read
-- aloud or re-type by hand when sharing a code with a friend in person).
-- floor(), not a bare ::integer cast -- casting a real to integer in
-- Postgres ROUNDS to nearest rather than truncating, so random()*32 could
-- occasionally round up to 32 and produce an out-of-range substr() start
-- position (silently returning '' for that character instead of erroring,
-- shortening the code below 8 chars). floor() always yields 0..31.
create or replace function private.generate_kin_code()
returns text
language sql
set search_path = ''
as $$
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 32)::integer + 1, 1), '')
  from generate_series(1, 8);
$$;

revoke execute on function private.generate_kin_code() from public, anon, authenticated;

-- Backfill every profile that predates this migration.
do $$
declare
  r record;
begin
  for r in select id from public.profiles where kin_code is null loop
    loop
      begin
        update public.profiles set kin_code = private.generate_kin_code() where id = r.id;
        exit;
      exception when unique_violation then
        -- extremely unlikely collision; loop and try another code
      end;
    end loop;
  end loop;
end $$;

alter table public.profiles alter column kin_code set not null;

-- Extends the existing signup trigger (20260804000000_profile_on_signup.sql)
-- so every new profile gets a real, unique kin_code from the moment it's
-- created rather than a separate lazy-generation code path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer := 0;
begin
  loop
    begin
      insert into public.profiles (id, kin_code) values (new.id, private.generate_kin_code())
      on conflict (id) do nothing;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 10 then
        raise exception 'could not generate a unique kin code' using errcode = 'P0001';
      end if;
    end;
  end loop;
  return new;
end;
$$;

create table public.kin_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'removed', 'blocked')),
  blocked_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  check (status <> 'blocked' or blocked_by is not null),
  check (status = 'blocked' or blocked_by is null)
);

-- One row per unordered pair, regardless of who is currently requester vs.
-- recipient (a 'removed' row is reused and its roles can flip on a fresh
-- request from either side — see redeem_kin_code below).
create unique index kin_connections_unique_pair on public.kin_connections (
  least(requester_id, recipient_id), greatest(requester_id, recipient_id)
);
create index kin_connections_recipient_pending_idx on public.kin_connections (recipient_id) where status = 'pending';
create index kin_connections_requester_idx on public.kin_connections (requester_id);

create trigger kin_connections_set_updated_at before update on public.kin_connections
  for each row execute function public.set_updated_at();

alter table public.kin_connections enable row level security;

-- Either party can see the connection row they're part of, in any status.
-- v1 does not hide "you were blocked" from the blocked party (the harder
-- signaling-avoidance version of block adds meaningful complexity without
-- a stated product requirement) — a blocked user can see they were
-- blocked, but redeem_kin_code below refuses to ever let them re-request.
create policy kin_connections_select_own on public.kin_connections for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- No direct insert/update/delete from clients — every mutation is a
-- state-machine transition enforced by the SECURITY DEFINER RPCs below
-- (only the recipient may accept/decline, a blocked pair can never
-- re-request, etc.), which RLS alone can't express well.
revoke all on public.kin_connections from public, anon, authenticated;
grant select on public.kin_connections to authenticated;
grant select, insert, update, delete on public.kin_connections to service_role;

-- profiles_select_own (20260803000000_initial_kinwin_schema.sql) only ever
-- let a user read their own row -- necessary but not sufficient now that
-- the client needs to render the other party's display name on a pending
-- request or an accepted Kin. Nothing on profiles is actually sensitive
-- (display_name, kin_code -- which is meant to be shared -- and a couple of
-- inert timestamps/preferences), so a second, additive row-level policy is
-- simpler and just as safe as a narrower view/RPC would be: still real
-- server-side authorization, not a client-side filter, and it naturally
-- covers both an incoming request (still 'pending') and an accepted Kin.
create policy profiles_select_kin on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.kin_connections c
      where c.status in ('pending', 'accepted')
        and ((c.requester_id = (select auth.uid()) and c.recipient_id = profiles.id)
          or (c.recipient_id = (select auth.uid()) and c.requester_id = profiles.id))
    )
  );

-- Sends a connection request to the owner of p_code. Reuses a 'removed'
-- row (either side may re-request later); refuses outright if the pair is
-- 'blocked' in either direction.
create or replace function public.redeem_kin_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_owner_id uuid;
  v_existing public.kin_connections%rowtype;
  v_connection_id uuid;
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
  if v_owner_id = caller then
    raise exception 'you cannot add yourself' using errcode = '22023';
  end if;

  select * into v_existing from public.kin_connections
    where least(requester_id, recipient_id) = least(caller, v_owner_id)
      and greatest(requester_id, recipient_id) = greatest(caller, v_owner_id)
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
    -- status = 'removed': a fresh request is allowed; reuse the row.
    update public.kin_connections
      set status = 'pending', requester_id = caller, recipient_id = v_owner_id, blocked_by = null
      where id = v_existing.id;
    return jsonb_build_object('status', 'requested', 'connectionId', v_existing.id);
  end if;

  insert into public.kin_connections (requester_id, recipient_id, status)
    values (caller, v_owner_id, 'pending')
    returning id into v_connection_id;
  return jsonb_build_object('status', 'requested', 'connectionId', v_connection_id);
end;
$$;

revoke all on function public.redeem_kin_code(text) from public, anon, authenticated;
grant execute on function public.redeem_kin_code(text) to authenticated;

create or replace function public.accept_kin_request(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_connection public.kin_connections%rowtype;
begin
  if caller is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_connection from public.kin_connections where id = p_connection_id for update;
  if not found or v_connection.recipient_id <> caller then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_connection.status = 'accepted' then
    return jsonb_build_object('status', 'accepted', 'connectionId', v_connection.id);
  end if;
  if v_connection.status <> 'pending' then
    raise exception 'this request is no longer pending' using errcode = '22023';
  end if;
  update public.kin_connections set status = 'accepted' where id = p_connection_id;
  return jsonb_build_object('status', 'accepted', 'connectionId', p_connection_id);
end;
$$;

revoke all on function public.accept_kin_request(uuid) from public, anon, authenticated;
grant execute on function public.accept_kin_request(uuid) to authenticated;

create or replace function public.decline_kin_request(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_connection public.kin_connections%rowtype;
begin
  if caller is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_connection from public.kin_connections where id = p_connection_id for update;
  if not found or v_connection.recipient_id <> caller then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_connection.status <> 'pending' then
    return jsonb_build_object('status', v_connection.status, 'connectionId', v_connection.id);
  end if;
  delete from public.kin_connections where id = p_connection_id;
  return jsonb_build_object('status', 'declined', 'connectionId', p_connection_id);
end;
$$;

revoke all on function public.decline_kin_request(uuid) from public, anon, authenticated;
grant execute on function public.decline_kin_request(uuid) to authenticated;

-- Cancels an outgoing request the caller themselves sent, before the other
-- party has responded.
create or replace function public.cancel_kin_request(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_connection public.kin_connections%rowtype;
begin
  if caller is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_connection from public.kin_connections where id = p_connection_id for update;
  if not found or v_connection.requester_id <> caller then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_connection.status <> 'pending' then
    return jsonb_build_object('status', v_connection.status, 'connectionId', v_connection.id);
  end if;
  delete from public.kin_connections where id = p_connection_id;
  return jsonb_build_object('status', 'canceled', 'connectionId', p_connection_id);
end;
$$;

revoke all on function public.cancel_kin_request(uuid) from public, anon, authenticated;
grant execute on function public.cancel_kin_request(uuid) to authenticated;

-- Soft removal: either accepted party may end the connection unilaterally.
-- The row becomes 'removed', not deleted, so a fresh request from either
-- side later is possible (see redeem_kin_code's reuse branch above) — this
-- is the "at minimum, users must be able to remove a Kin" requirement.
create or replace function public.remove_kin(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_connection public.kin_connections%rowtype;
begin
  if caller is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_connection from public.kin_connections where id = p_connection_id for update;
  if not found or (v_connection.requester_id <> caller and v_connection.recipient_id <> caller) then
    raise exception 'connection not found' using errcode = 'P0002';
  end if;
  if v_connection.status <> 'accepted' then
    raise exception 'this connection is not currently active' using errcode = '22023';
  end if;
  update public.kin_connections set status = 'removed' where id = p_connection_id;
  return jsonb_build_object('status', 'removed', 'connectionId', p_connection_id);
end;
$$;

revoke all on function public.remove_kin(uuid) from public, anon, authenticated;
grant execute on function public.remove_kin(uuid) to authenticated;

-- Hard removal, identified by the other user's id rather than a connection
-- id so it works whether or not a connection row exists yet. The blocked
-- party can never send a new request afterward (redeem_kin_code rejects
-- any 'blocked' pair outright) and loses access to this user's Kin-only
-- activity as soon as status leaves 'accepted' (see social_activity's own
-- RLS, which only trusts an 'accepted' row).
create or replace function public.block_kin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_existing public.kin_connections%rowtype;
  v_connection_id uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_user_id is null or p_user_id = caller then
    raise exception 'a valid other user is required' using errcode = '22023';
  end if;

  select * into v_existing from public.kin_connections
    where least(requester_id, recipient_id) = least(caller, p_user_id)
      and greatest(requester_id, recipient_id) = greatest(caller, p_user_id)
    for update;

  if found then
    update public.kin_connections set status = 'blocked', blocked_by = caller where id = v_existing.id;
    return jsonb_build_object('status', 'blocked', 'connectionId', v_existing.id);
  end if;

  insert into public.kin_connections (requester_id, recipient_id, status, blocked_by)
    values (caller, p_user_id, 'blocked', caller)
    returning id into v_connection_id;
  return jsonb_build_object('status', 'blocked', 'connectionId', v_connection_id);
end;
$$;

revoke all on function public.block_kin(uuid) from public, anon, authenticated;
grant execute on function public.block_kin(uuid) to authenticated;
