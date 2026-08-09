-- Trusted write for the finalize-challenge edge function. That function
-- re-runs the real evaluateChallenge engine (domain/challenge/results.ts,
-- byte-identical copy at supabase/functions/_shared/check-in-engine/
-- results.ts) against real persisted challenge/period/check-in state to
-- decide success or failure authoritatively server-side -- this RPC's job
-- is only the atomic write of that already-decided result: transition
-- challenge_status and record the corresponding challenge_succeeded /
-- challenge_failed social_activity row, idempotently.
--
-- Closes a previously-known gap: before this, nothing persisted
-- evaluateChallenge's result back to challenge_status -- Home only ever
-- detected completion client-side. Lives in `public`, called over
-- PostgREST by the edge function using the service-role key, same pattern
-- as append_check_in_event (20260812000000_check_in_append.sql). EXECUTE
-- is granted only to service_role; the client never calls this directly.

create function public.finalize_challenge_result(
  p_owner_id uuid,
  p_challenge_id uuid,
  p_status text,
  p_activity_kind text,
  p_activity_payload jsonb,
  p_dedupe_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
begin
  if p_owner_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_status not in ('completed_success', 'completed_failure') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_activity_kind not in ('challenge_succeeded', 'challenge_failed') then
    raise exception 'invalid activity kind' using errcode = '22023';
  end if;
  if p_activity_payload is null or jsonb_typeof(p_activity_payload) <> 'object' then
    raise exception 'activity payload is invalid' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_dedupe_key)), 0) = 0 then
    raise exception 'a dedupe key is required' using errcode = '22023';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id and owner_id = p_owner_id for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  -- Already finalized (e.g. a second opportunistic client-triggered call
  -- racing the first, or a retry) -- idempotent no-op, same shape as a
  -- fresh finalize, never an error.
  if v_challenge.challenge_status in ('completed_success', 'completed_failure') then
    return jsonb_build_object('status', v_challenge.challenge_status, 'alreadyFinalized', true);
  end if;
  if v_challenge.challenge_status <> 'active' then
    raise exception 'challenge must be active to finalize' using errcode = '22023';
  end if;

  update public.challenges set challenge_status = p_status, completed_at = now() where id = p_challenge_id;

  insert into public.social_activity (owner_id, challenge_id, kind, payload, dedupe_key)
  values (p_owner_id, p_challenge_id, p_activity_kind, p_activity_payload, p_dedupe_key)
  on conflict (owner_id, dedupe_key) do nothing;

  return jsonb_build_object('status', p_status, 'alreadyFinalized', false);
end;
$$;

revoke all on function public.finalize_challenge_result(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.finalize_challenge_result(uuid, uuid, text, text, jsonb, text) to service_role;
