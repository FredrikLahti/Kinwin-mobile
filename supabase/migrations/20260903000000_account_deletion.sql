-- Real in-app account deletion (docs/ACCOUNT_DELETION_DECISIONS.md). Locked
-- founder decisions this implements:
--   1. Deletion is blocked outright while any challenge/payment/reward
--      obligation is non-terminal — never an escape hatch from a
--      commitment.
--   2. Once everything is terminal/resolved, the deleting user's own
--      Kinwin content is hard-deleted (no tombstone/anonymized-in-place
--      model).
--   3. kin_connections/social_activity/activity_reactions rely on their
--      existing `on delete cascade` from auth.users — no tombstone model.
--   4. Recipient/organizer display names never survive the owner's
--      deleted challenge graph (they live only on rows this migration
--      deletes; nothing copies them elsewhere).
--   5. TEST-only Stripe/Tremendous references are deleted with the rest of
--      the graph. Production real-money retention is explicitly NOT solved
--      here — see the comment above delete_account_owned_data below.
--
-- Verified directly against the current schema (all 31 prior migrations),
-- not against the decision document's own prose, which predates some of
-- this. Two things the decision document did not (and could not) account
-- for, discovered while writing this migration:
--
-- (a) `challenge_status` gained `awaiting_resolution` after that document
--     was written (20260820000000_challenge_completion_lifecycle.sql).
--     Eligibility below uses a TERMINAL allow-list, not a non-terminal
--     block-list, specifically so any future status value defaults to
--     *blocking* deletion rather than silently allowing it through.
--
-- (b) Three triggers make specific rows physically undeletable by ANY
--     role, including service_role, as they stand today:
--       - check_in_events: reject_check_in_event_mutation() (append-only,
--         initial schema)
--       - challenge_drafts, once archived: reject_archived_draft_mutation()
--         (20260807000000)
--       - challenge_reward_organizers: protect_canonical_reward_organizer()
--         (20260826000000)
--     Each exists for a real reason (audit-integrity of check-in history;
--     immutability of an already-prepared commitment's summary; a single
--     canonical, immutable reward organizer per challenge) that has
--     nothing to do with account deletion, so none of that is weakened
--     here. Instead, each trigger gains one narrow, additive exception:
--     DELETE (never UPDATE — corrections must still always be new rows,
--     and organizer/draft immutability against UPDATE is untouched) is
--     allowed only when a transaction-local session flag is set, and that
--     flag can only ever be set from inside delete_account_owned_data
--     below — no client role, and no other trusted function, ever sets it.
--     `set_config(..., true)` (the `is_local` argument) scopes the flag to
--     the current transaction only; it cannot leak to another session or
--     survive past this function's own COMMIT/ROLLBACK.

-- ---------------------------------------------------------------------
-- Part 1: narrow, additive DELETE exceptions on the three blanket
-- immutability triggers above. Each diff is minimal: the original
-- unconditional `raise exception` gains one guarded early return, nothing
-- else about the function changes.
-- ---------------------------------------------------------------------

create or replace function public.reject_check_in_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('kinwin.allow_owned_data_deletion', true), 'off') = 'on' then
    return old;
  end if;
  raise exception 'check_in_events is append-only: rows cannot be updated or deleted'
    using errcode = '23000';
end;
$$;

create or replace function public.reject_archived_draft_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.draft_status = 'archived' then
    if tg_op = 'DELETE' and coalesce(current_setting('kinwin.allow_owned_data_deletion', true), 'off') = 'on' then
      return old;
    end if;
    raise exception 'archived challenge_drafts rows are immutable' using errcode = '23000';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.protect_canonical_reward_organizer()
returns trigger language plpgsql set search_path='' as $$ begin
  if tg_op = 'DELETE' and coalesce(current_setting('kinwin.allow_owned_data_deletion', true), 'off') = 'on' then
    return old;
  end if;
  raise exception 'canonical reward organizer is immutable' using errcode='23000';
end $$;

-- ---------------------------------------------------------------------
-- Part 2: eligibility. One shared, always-locking core so the read-only
-- preflight and the authoritative pre-delete recheck can never drift out
-- of sync with each other. `FOR UPDATE` on every row it inspects is what
-- makes the recheck immediately before deletion race-safe against a
-- concurrent worker (claim_due_consequence_payments / claim_due_reward_*)
-- trying to move one of the same rows forward at the same instant: either
-- this call's lock wins and the worker waits, or the worker's lock wins
-- and this call waits — either way, by the time this call proceeds, the
-- status it reads is genuinely current, not a stale snapshot. The same
-- locking cost is harmless for the read-only preflight path too: it is a
-- single fast statement inside one short-lived RPC call, not a
-- long-held lock.
-- ---------------------------------------------------------------------

create or replace function private.account_deletion_blocker(p_owner_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_charge private.consequence_charge_attempts%rowtype;
  v_reward private.reward_fulfillments%rowtype;
begin
  -- Any challenge not in a genuinely terminal status blocks outright.
  -- Terminal allow-list (not a non-terminal block-list): an unrecognized
  -- future status value defaults to blocking, never to silently allowing
  -- deletion through.
  if exists (
    select 1 from public.challenges c
    where c.owner_id = p_owner_id
      and c.challenge_status not in ('completed_success', 'completed_failure', 'canceled_before_activation', 'superseded')
    for update of c
  ) then
    return 'active_challenge';
  end if;

  -- A completed_failure challenge's consequence must be fully resolved:
  -- the charge itself terminal, and — only if the charge actually
  -- succeeded, since a failed charge never creates a reward obligation —
  -- the reward fulfillment also terminal.
  for v_row in
    select co.id as consequence_id
    from public.challenges c
    join public.consequences co on co.challenge_id = c.id
    where c.owner_id = p_owner_id and c.challenge_status = 'completed_failure'
  loop
    select * into v_charge from private.consequence_charge_attempts
      where consequence_id = v_row.consequence_id for update;
    if not found or v_charge.status not in ('succeeded', 'permanently_failed', 'canceled') then
      return 'payment_recovery_pending';
    end if;

    if v_charge.status = 'succeeded' then
      select * into v_reward from private.reward_fulfillments
        where consequence_id = v_row.consequence_id for update;
      if not found or v_reward.status not in ('delivered', 'terminal_failure', 'canceled') then
        return 'reward_fulfillment_pending';
      end if;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function private.account_deletion_blocker(uuid) from public, anon, authenticated;

-- Safe, owner-scoped read the client calls directly for the preflight
-- screen — mirrors get_owner_reward_progress/get_owner_payment_status's
-- own auth.uid()-scoped, coarse-jsonb-result convention. Never exposes a
-- raw database status string: `reason` is one of a small fixed set of
-- tokens the client maps to real copy (lib/account-deletion.ts).
create or replace function public.check_account_deletion_eligibility()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_reason text;
begin
  v_reason := private.account_deletion_blocker(auth.uid());
  if v_reason is null then
    return jsonb_build_object('eligible', true);
  end if;
  return jsonb_build_object('eligible', false, 'reason', v_reason);
end;
$$;

revoke all on function public.check_account_deletion_eligibility() from public, anon;
grant execute on function public.check_account_deletion_eligibility() to authenticated;

-- ---------------------------------------------------------------------
-- Part 3: the actual destructive orchestration. Called only from
-- supabase/functions/delete-account/index.ts via the service-role client,
-- with p_owner_id taken from that function's own verified caller JWT —
-- exactly the create-consequence-setup-intent/prepare_consequence_setup
-- convention (a service-role-only RPC takes an explicit owner id because
-- auth.uid() does not resolve to the original end user inside a
-- service-role-authenticated call).
--
-- Ordered leaf-to-root to satisfy every `on delete restrict` foreign key
-- in the graph (verified directly against the schema, not assumed):
-- reward_link_access_events, reward_fulfillments, consequence_setup_
-- attempts, consequence_charge_attempts, consequence_provider_references,
-- invitations, consequences, challenge_reward_organizers, check_in_events,
-- challenge_periods, challenge_recipients, challenge_period_generations,
-- (challenge_completion_worker_failures detached, not deleted — an
-- operational log, nullable FK), playbook_entries linked to one of these
-- challenges, challenges, challenge_drafts, then the account-level rows
-- (kin_connections, activity_reactions, social_activity, any remaining
-- playbook_entries never tied to a challenge, stripe_customers,
-- memberships, profiles) — auth.users itself is deleted by the Edge Function afterward,
-- via the Admin API, only once every one of these commits successfully.
--
-- check_in_events is deleted leaf-first by its own correction_of_event_id
-- chain (repeatedly removing rows nothing else corrects) rather than in
-- one statement, so the self-referencing RESTRICT foreign key can never
-- see a still-referenced row, regardless of how deep a correction chain
-- happens to be.
--
-- PRODUCTION REAL-MONEY NOTE (explicitly not solved here — see
-- docs/ACCOUNT_DELETION_DECISIONS.md's "Payment / provider records"
-- section): every Stripe/Tremendous reference this function deletes is
-- TEST-mode only, per the founder's explicit instruction for this pass.
-- A future production launch will need a decoupled, minimal retained-
-- record step (provider ids, amounts, status — never a display name or
-- challenge text) written *before* the deletes below, for whatever
-- retention period real legal/accounting review decides. Nothing here
-- forecloses adding that: it would be one new step inserted before the
-- consequence/invitation deletes, not a redesign of this function.
-- ---------------------------------------------------------------------

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

  -- Operational worker log, not user content: detach rather than delete,
  -- since the FK is nullable and this table exists to audit worker
  -- behavior, not to hold anything this deletion is about.
  update private.challenge_completion_worker_failures
    set challenge_id = null where challenge_id = any(v_challenge_ids);

  delete from public.playbook_entries where source_challenge_id = any(v_challenge_ids);
  delete from public.challenges where owner_id = p_owner_id;
  delete from public.challenge_drafts where owner_id = p_owner_id;

  perform set_config('kinwin.allow_owned_data_deletion', 'off', true);

  -- The remaining owner-scoped tables all already permit a normal delete
  -- (no blocking trigger, no restrict FK left pointing at them) — explicit
  -- here rather than left to auth.users' own cascade, so this function's
  -- own success/failure is a true, verifiable statement about whether the
  -- owner's data is actually gone, not merely a promise the later Admin
  -- API call will keep.
  delete from public.kin_connections where requester_id = p_owner_id or recipient_id = p_owner_id;
  delete from public.activity_reactions where user_id = p_owner_id;
  delete from public.social_activity where owner_id = p_owner_id;
  -- Catches a Playbook entry never tied to any specific challenge (a
  -- general lesson, source_challenge_id null) — the earlier delete above
  -- only reaches entries linked to one of this owner's now-deleted
  -- challenges. Safe to repeat: those are already gone by this point.
  delete from public.playbook_entries where owner_id = p_owner_id;
  delete from private.stripe_customers where owner_id = p_owner_id;
  delete from public.memberships where owner_id = p_owner_id;
  delete from public.profiles where id = p_owner_id;
end;
$$;

revoke all on function private.delete_account_owned_data(uuid) from public, anon, authenticated;
grant execute on function private.delete_account_owned_data(uuid) to service_role;
