-- Trusted idempotent check-in append (docs/BACKEND_IMPLEMENTATION_PLAN.md
-- phase 5). This function does NOT re-derive the idempotency/correction/
-- reporting-deadline decision itself -- that contract
-- (domain/challenge/check-in/append-plan.ts's `planCheckInAppend`) is
-- reused verbatim by supabase/functions/append-check-in-event (a byte-
-- identical copy lives at supabase/functions/_shared/check-in-engine/ for
-- the Deno runtime boundary -- Deno requires explicit .ts extensions on
-- relative imports that the RN/tsc side does not use, so the source of
-- truth can't be imported directly without a build step; see that
-- directory's own file headers). This RPC is only ever called after that
-- Edge Function has already decided 'insert' -- its job is the atomic write
-- and a defense-in-depth re-check of the invariants that must always hold
-- regardless of caller correctness: ownership, that the challenge is
-- genuinely active, that the period actually belongs to the challenge, and
-- that the payload shape matches the declared event type (deferred here, on
-- purpose, since the table's own CHECK constraint only proves "some
-- non-empty JSON object" -- see that migration's comment).
--
-- Lives in `public`, not `private`, for the same reason
-- 20260810000000_consequence_setup_stripe.sql's three RPCs do: it is called
-- over PostgREST by an Edge Function using the service-role key, which only
-- works for functions in an exposed schema. `EXECUTE` is granted only to
-- `service_role`, never `anon`/`authenticated` -- the client never calls
-- this directly, only through the Edge Function, which derives `p_owner_id`
-- from a verified user JWT, never from request body content.

create function public.append_check_in_event(
  p_owner_id uuid,
  p_challenge_id uuid,
  p_period_id uuid,
  p_event_type text,
  p_event_payload jsonb,
  p_source text,
  p_client_recorded_at timestamptz,
  p_idempotency_key text,
  p_correction_of_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
  v_period public.challenge_periods%rowtype;
  v_new_id uuid;
  v_server_recorded_at timestamptz;
begin
  if p_owner_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_event_type not in ('build_completion', 'cut_back_total', 'stop_intact', 'stop_lapse', 'correction') then
    raise exception 'invalid event type' using errcode = '22023';
  end if;
  if p_event_type = 'correction' and p_correction_of_event_id is null then
    raise exception 'a correction requires correction_of_event_id' using errcode = '22023';
  end if;
  if p_event_type <> 'correction' and p_correction_of_event_id is not null then
    raise exception 'only a correction may set correction_of_event_id' using errcode = '22023';
  end if;
  if p_source not in ('ios', 'android', 'web', 'server', 'support') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_idempotency_key)), 0) = 0 then
    raise exception 'an idempotency key is required' using errcode = '22023';
  end if;
  if p_client_recorded_at is null then
    raise exception 'client_recorded_at is required' using errcode = '22023';
  end if;
  if p_event_payload is null or jsonb_typeof(p_event_payload) <> 'object' or p_event_payload = '{}'::jsonb then
    raise exception 'event payload is invalid' using errcode = '22023';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id and owner_id = p_owner_id;
  if not found then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;
  if v_challenge.challenge_status <> 'active' then
    raise exception 'challenge must be active to check in' using errcode = '22023';
  end if;

  select * into v_period from public.challenge_periods where id = p_period_id and challenge_id = p_challenge_id;
  if not found then
    raise exception 'period not found for this challenge' using errcode = 'P0002';
  end if;

  -- Per-event-type payload shape validation. `event_payload` stores the
  -- domain `CheckInFact` JSON as-is (always carries its own `kind`,
  -- matching the declared event_type for an original event; for a
  -- correction, `kind` names the NEW fact being declared).
  if p_event_type in ('build_completion', 'cut_back_total', 'stop_intact', 'stop_lapse')
    and (p_event_payload ->> 'kind') is distinct from p_event_type then
    raise exception 'event payload kind must match the event type' using errcode = '22023';
  end if;
  if p_event_type = 'build_completion' and (
    not (p_event_payload ? 'completions')
    or jsonb_typeof(p_event_payload -> 'completions') <> 'number'
    or (p_event_payload ->> 'completions')::numeric < 0
  ) then
    raise exception 'build_completion payload is invalid' using errcode = '22023';
  end if;
  if p_event_type = 'cut_back_total' and (
    not (p_event_payload ? 'total')
    or jsonb_typeof(p_event_payload -> 'total') <> 'number'
    or (p_event_payload ->> 'total')::numeric < 0
    or not (p_event_payload ? 'unit')
    or jsonb_typeof(p_event_payload -> 'unit') <> 'string'
    or length(btrim(p_event_payload ->> 'unit')) = 0
  ) then
    raise exception 'cut_back_total payload is invalid' using errcode = '22023';
  end if;
  if p_event_type = 'correction' and (
    not (p_event_payload ? 'kind')
    or (p_event_payload ->> 'kind') not in ('build_completion', 'cut_back_total', 'stop_intact', 'stop_lapse')
  ) then
    raise exception 'correction payload is invalid' using errcode = '22023';
  end if;
  if p_event_type = 'correction' and not exists (
    select 1 from public.check_in_events
    where id = p_correction_of_event_id and challenge_id = p_challenge_id
  ) then
    raise exception 'correction_of_event_id does not reference an event in this challenge' using errcode = '22023';
  end if;

  begin
    insert into public.check_in_events (
      challenge_id, owner_id, period_id, event_type, event_payload, source,
      client_recorded_at, idempotency_key, correction_of_event_id
    ) values (
      p_challenge_id, p_owner_id, p_period_id, p_event_type, p_event_payload, p_source,
      p_client_recorded_at, p_idempotency_key, p_correction_of_event_id
    )
    returning id, server_recorded_at into v_new_id, v_server_recorded_at;
  exception when unique_violation then
    -- Lost a race against a concurrent call carrying the same idempotency
    -- key (the Edge Function already checked for this before calling here,
    -- but that check-then-insert gap is real under concurrency) — return
    -- the winning row's identity instead of a raw constraint error.
    select id, server_recorded_at into v_new_id, v_server_recorded_at
      from public.check_in_events
      where challenge_id = p_challenge_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('eventId', v_new_id, 'serverRecordedAt', v_server_recorded_at, 'idempotentReplay', true);
  end;

  return jsonb_build_object('eventId', v_new_id, 'serverRecordedAt', v_server_recorded_at, 'idempotentReplay', false);
end;
$$;

revoke all on function public.append_check_in_event(
  uuid, uuid, uuid, text, jsonb, text, timestamptz, text, uuid
) from public, anon, authenticated;
grant execute on function public.append_check_in_event(
  uuid, uuid, uuid, text, jsonb, text, timestamptz, text, uuid
) to service_role;
