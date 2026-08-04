-- Once prepare_challenge_from_draft archives a draft, that row backs the
-- read-only summary a pending commitment shows (goal, behavior,
-- successRule, duration, experience category — see
-- lib/supabase/challenge-repository.ts's fetchPendingCommitment). The
-- owner's existing UPDATE/DELETE grants on challenge_drafts were never
-- scoped to draft_status, so a later save that still targets this same
-- draft id (e.g. a stale client session, or a second device with the old
-- draft still open) could silently rewrite its content, or delete it
-- outright — quietly breaking the product rule that a pending commitment
-- is no longer editable, even though the separately-created
-- challenge_recipients/consequences rows would stay exactly as they were.
-- This makes an archived draft immutable at the database level, for every
-- role, closing that gap at its actual source rather than in one client
-- code path.

create function public.reject_archived_draft_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.draft_status = 'archived' then
    raise exception 'archived challenge_drafts rows are immutable' using errcode = '23000';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.reject_archived_draft_mutation() from public, anon, authenticated;

create trigger challenge_drafts_reject_archived_update
  before update on public.challenge_drafts
  for each row execute function public.reject_archived_draft_mutation();
create trigger challenge_drafts_reject_archived_delete
  before delete on public.challenge_drafts
  for each row execute function public.reject_archived_draft_mutation();
