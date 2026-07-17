-- Sprint 4 lock-down: profiles + roles, owner-scoped RLS replacing permissive v1 policies.
-- Demo rows (user_id IS NULL) remain publicly readable but immutable;
-- authenticated users read demo + own rows and write only their own.

-- Profiles with role (admin / cosec / reviewer)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'cosec' check (role in ('admin','cosec','reviewer')),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
drop policy if exists "profiles_read_own" on profiles;
create policy "profiles_read_own" on profiles for select using (auth.uid() = id);
-- No self-service profile updates in v1: role changes are an admin/SQL operation.
drop policy if exists "profiles_update_own" on profiles;

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Stamp ownership automatically on insert
alter table meetings alter column user_id set default auth.uid();
alter table transcripts alter column user_id set default auth.uid();
alter table minutes_drafts alter column user_id set default auth.uid();
alter table resolutions alter column user_id set default auth.uid();
alter table action_items alter column user_id set default auth.uid();
alter table audit_logs alter column user_id set default auth.uid();

-- Replace permissive v1 policies with owner policies (demo rows readable by all)
do $$
declare t text;
begin
  foreach t in array array['meetings','transcripts','minutes_drafts','resolutions','action_items','audit_logs'] loop
    execute format('drop policy if exists "%s_v1_read" on %I', t, t);
    execute format('drop policy if exists "%s_v1_write" on %I', t, t);
    execute format('drop policy if exists "%s_read" on %I', t, t);
    execute format('drop policy if exists "%s_insert" on %I', t, t);
    execute format('drop policy if exists "%s_update" on %I', t, t);
    execute format('drop policy if exists "%s_delete" on %I', t, t);
    execute format('create policy "%s_read" on %I for select using (user_id is null or auth.uid() = user_id)', t, t);
    execute format('create policy "%s_insert" on %I for insert to authenticated with check (auth.uid() = user_id)', t, t);
    execute format('create policy "%s_update" on %I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('create policy "%s_delete" on %I for delete to authenticated using (auth.uid() = user_id)', t, t);
  end loop;
end $$;
