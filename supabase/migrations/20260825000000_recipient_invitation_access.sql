-- Durable, scoped recipient access. Raw bearer tokens are never persisted.
-- Hosted Supabase already provides the extensions schema; the plain Postgres
-- assertion harness does not, so keep this migration portable across both.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.invitations
  add column token_hash text,
  add column token_issued_at timestamptz,
  add column last_shared_at timestamptz;

create unique index invitations_one_per_recipient_idx
  on public.invitations (recipient_id) where recipient_id is not null;
create unique index invitations_token_hash_idx
  on public.invitations (token_hash) where token_hash is not null;
alter table public.invitations add constraint invitations_token_hash_shape
  check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');
alter table public.invitations add constraint invitations_token_dates
  check ((token_hash is null and token_issued_at is null) or (token_hash is not null and token_issued_at is not null));

-- A future fulfillment worker can deterministically find the accepted access
-- record for one locked challenge recipient without exposing this join publicly.
create view private.accepted_recipient_delivery_targets
with (security_invoker = true) as
select i.id as invitation_id, i.challenge_id, i.recipient_id, c.id as consequence_id
from public.invitations i
join public.consequences c on c.challenge_id = i.challenge_id
where i.invitation_status = 'accepted' and i.recipient_id is not null and i.token_hash is not null;

revoke all on private.accepted_recipient_delivery_targets from public, anon, authenticated;
grant select on private.accepted_recipient_delivery_targets to service_role;

-- Existing table grants remain owner-read-only. Anonymous callers receive no
-- table privileges and can only use the dedicated Edge Function projection.
revoke all on public.invitations from anon;
