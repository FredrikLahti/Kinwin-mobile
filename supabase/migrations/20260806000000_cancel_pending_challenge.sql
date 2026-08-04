-- Trusted server boundary that lets the owner of a server-owned pending
-- commitment (see 20260805000000_prepare_challenge_from_draft.sql) cancel
-- it before activation. Preserves every row — the challenge, its
-- recipients, its consequence, and the already-archived source draft all
-- stay exactly as they are, only `challenge_status`/`consequences.status`
-- move to 'canceled_before_activation'. No table is deleted from or has
-- its client grants changed by this migration.

create function public.cancel_pending_challenge(challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  -- Copied from the parameter immediately, but the parameter itself
  -- (`challenge_id`) stays in scope for the whole function body regardless
  -- — `consequences` has its own `challenge_id` column, so every query
  -- against that table below still fully qualifies the column
  -- (`public.consequences.challenge_id`) rather than relying on this local
  -- name alone, which would remain ambiguous against the parameter.
  target_id uuid := challenge_id;
  current_status text;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select challenge_status into current_status
    from public.challenges
    where id = target_id and owner_id = caller
    for update;
  if not found then
    -- Deliberately identical to a not-found error for a challenge owned by
    -- someone else, so this never discloses whether a given id exists.
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  -- Idempotent: a challenge already canceled returns the same result
  -- instead of erroring on a repeated request.
  if current_status = 'canceled_before_activation' then
    return jsonb_build_object('challengeId', target_id, 'status', current_status);
  end if;

  if current_status <> 'pending_activation' then
    raise exception 'only a pending commitment can be canceled before activation' using errcode = '22023';
  end if;

  update public.challenges set challenge_status = 'canceled_before_activation' where id = target_id;
  update public.consequences set status = 'canceled_before_activation' where public.consequences.challenge_id = target_id;

  return jsonb_build_object('challengeId', target_id, 'status', 'canceled_before_activation');
end;
$$;

-- Minimum required execute permission: only signed-in clients canceling
-- their own pending commitment may call this, never anon and never via a
-- broader grant.
revoke all on function public.cancel_pending_challenge(uuid) from public, anon, authenticated;
grant execute on function public.cancel_pending_challenge(uuid) to authenticated;
