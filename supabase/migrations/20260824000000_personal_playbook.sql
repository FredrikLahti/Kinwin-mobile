-- User-owned, reusable learnings for future challenges. This is ordinary
-- authenticated product data: no service-role write path is needed.
create table public.playbook_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('trigger','obstacle','replacement','environment','support','lesson')),
  content text not null check (length(btrim(content)) between 1 and 280),
  source_challenge_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_challenge_id, owner_id) references public.challenges(id, owner_id) on delete restrict
);

create index playbook_entries_owner_active_idx on public.playbook_entries(owner_id, updated_at desc)
  where archived_at is null;
create index playbook_entries_source_challenge_idx on public.playbook_entries(source_challenge_id)
  where source_challenge_id is not null;
create trigger playbook_entries_set_updated_at before update on public.playbook_entries
  for each row execute function public.set_updated_at();

alter table public.playbook_entries enable row level security;
create policy playbook_entries_select_own on public.playbook_entries for select to authenticated
  using (owner_id = auth.uid());
create policy playbook_entries_insert_own on public.playbook_entries for insert to authenticated
  with check (owner_id = auth.uid());
create policy playbook_entries_update_own on public.playbook_entries for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy playbook_entries_delete_own on public.playbook_entries for delete to authenticated
  using (owner_id = auth.uid());

revoke all on public.playbook_entries from public, anon, authenticated;
grant select, insert, update, delete on public.playbook_entries to authenticated;
grant select, insert, update, delete on public.playbook_entries to service_role;
