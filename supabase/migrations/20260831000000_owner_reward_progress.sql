-- Owner-safe product projection. No provider identifiers, links, tokens, or private errors.
create function public.get_owner_reward_progress(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'state',case
      when i.invitation_status is distinct from 'accepted' then 'waiting_for_organizer'
      when f.status='terminal_failure' then 'needs_attention'
      when co.status='reward_delivered' and f.status='delivered' and f.provider_status='SUCCEEDED' then 'ready'
      else 'preparing' end,
    'organizerName',o.display_name,
    'organizerIsRecipient',o.organizer_kind='recipient'
  ) into result
  from public.challenges c
  join public.consequences co on co.challenge_id=c.id
  join public.challenge_reward_organizers o on o.challenge_id=c.id
  left join public.invitations i on i.organizer_id=o.id or (o.organizer_kind='recipient' and i.recipient_id=o.challenge_recipient_id)
  left join private.reward_fulfillments f on f.consequence_id=co.id and f.organizer_id=o.id
  where c.id=p_challenge_id and c.owner_id=auth.uid() and c.challenge_status='completed_failure';
  return result;
end $$;
revoke all on function public.get_owner_reward_progress(uuid) from public,anon;
grant execute on function public.get_owner_reward_progress(uuid) to authenticated;
