-- Forward-only migration: automatically create a public.profiles row when a
-- new auth.users row is created, so the client never selects its own
-- profile ID and profile ownership always exactly matches Auth identity.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ON CONFLICT makes a retried/duplicated signup attempt idempotent instead
  -- of raising and rolling back the auth.users insert it's attached to.
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- SECURITY DEFINER is required here: the trigger must be able to write
-- public.profiles regardless of which role performed the auth.users insert,
-- but it must never be callable directly by a client.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
