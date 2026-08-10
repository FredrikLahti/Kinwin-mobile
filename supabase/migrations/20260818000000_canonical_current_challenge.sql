-- Physical-device follow-up: TEST account's Home / FROM YOUR KIN showed
-- THREE current challenges for the MAIN account (two 'Strength train',
-- one 'Time on social media') while the MAIN account's own Home
-- correctly showed only one ('No unhealthy food').
--
-- Root cause, confirmed by directly inspecting the real hosted
-- public.challenges rows (read-only, via `supabase db query --linked`):
-- the MAIN account owner had SIX rows with challenge_status = 'active'
-- simultaneously, activated at different times across the same day.
-- Nothing in this product currently transitions an old challenge out of
-- 'active' when a new one is activated -- a pre-existing gap in the
-- activation lifecycle, not something this migration introduces or
-- attempts to fix (that requires its own scoped package: e.g. a rule
-- that activating a new challenge finalizes/supersedes any prior one).
-- Home's own read (lib/supabase/active-challenge-repository.ts's
-- fetchActiveChallenge) already masks this correctly --
-- `.eq('challenge_status','active').order('activated_at',{ascending:false}).limit(1)`
-- -- but get_kin_current_challenges (20260817000000) filtered only on
-- challenge_status = 'active' with no such tie-break, so it returned
-- every stale row instead of just the one Home actually shows.
--
-- Fixed by giving both reads one canonical, reusable definition of
-- "current active challenge": the single most-recently-activated row
-- still marked 'active', per owner. Real, non-canonical rows are left
-- untouched -- per the founder's explicit instruction, this migration
-- does not delete or mutate any existing data, only changes which row
-- the query surfaces. If a genuine "supersede the old challenge on
-- reactivation" product rule is wanted later, it belongs in a dedicated
-- activation-lifecycle package, not bundled into this social-visibility
-- fix.
create or replace view private.canonical_current_challenges as
select distinct on (owner_id) *
from public.challenges
where challenge_status = 'active'
order by owner_id, activated_at desc;

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
    from private.canonical_current_challenges c
    where c.owner_id <> caller
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
