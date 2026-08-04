-- Test-only stand-in for the parts of Supabase's platform-managed `auth` schema
-- that this migration depends on but does not itself create: `auth.users` and
-- `auth.uid()`. Supabase provisions the real versions outside any migration.
--
-- `auth.uid()` is reproduced faithfully: Supabase's own implementation reads
-- the current request's subject claim from the `request.jwt.claim.sub`
-- session setting (populated by PostgREST from the caller's JWT). This stub
-- does the same, so tests can simulate a caller by running
-- `select set_config('request.jwt.claim.sub', '<uuid>', true);` before a
-- query, exactly as a real authenticated PostgREST request would populate it.
--
-- Not part of the production migration. Local test harness only.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Supabase provisions these roles on every project; the migration grants to them.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant anon, authenticated, service_role to current_user;

-- Real Supabase projects run signup through GoTrue (as the platform-internal
-- supabase_auth_admin role), which this harness has no way to run. Tests
-- simulate "a signup happened" by inserting into auth.users as service_role
-- instead — the only stand-in role this stub has that is meant to represent
-- trusted, non-client-reachable operations. Client roles (anon/authenticated)
-- deliberately get no grant on the auth schema at all, matching production.
grant usage on schema auth to service_role;
grant select, insert, update, delete on table auth.users to service_role;
