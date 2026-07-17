-- "Later" plan: team workspaces (ARCHITECTURE.md) + precedent matching support
-- (INTELLIGENCE_LAYER.md, pg_trgm) + review shares (AGENTIC_LAYER send_draft_for_review).

create extension if not exists pg_trgm;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  invited_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

alter table meetings add column if not exists workspace_id uuid references workspaces(id);

-- security definer helper avoids RLS recursion when policies check membership
create or replace function is_workspace_member(wid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select wid is not null and exists (
    select 1 from workspace_members where workspace_id = wid and user_id = auth.uid()
  );
$$;

create or replace function can_access_meeting(mid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from meetings m
    where m.id = mid
      and (m.user_id is null or m.user_id = auth.uid() or is_workspace_member(m.workspace_id))
  );
$$;

alter table workspaces enable row level security;
drop policy if exists "workspaces_read" on workspaces;
create policy "workspaces_read" on workspaces for select
  using (created_by = auth.uid() or is_workspace_member(id));
drop policy if exists "workspaces_insert" on workspaces;
create policy "workspaces_insert" on workspaces for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists "workspaces_update" on workspaces;
create policy "workspaces_update" on workspaces for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

alter table workspace_members enable row level security;
drop policy if exists "wm_read" on workspace_members;
create policy "wm_read" on workspace_members for select
  using (user_id = auth.uid() or is_workspace_member(workspace_id));
drop policy if exists "wm_insert" on workspace_members;
create policy "wm_insert" on workspace_members for insert to authenticated
  with check (
    -- workspace creator adds members; users may add themselves (invite acceptance is trigger-driven)
    user_id = auth.uid()
    or exists (select 1 from workspaces w where w.id = workspace_id and w.created_by = auth.uid())
  );
drop policy if exists "wm_delete" on workspace_members;
create policy "wm_delete" on workspace_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from workspaces w where w.id = workspace_id and w.created_by = auth.uid())
  );

alter table workspace_invites enable row level security;
drop policy if exists "wi_read" on workspace_invites;
create policy "wi_read" on workspace_invites for select
  using (is_workspace_member(workspace_id) or invited_by = auth.uid());
drop policy if exists "wi_insert" on workspace_invites;
create policy "wi_insert" on workspace_invites for insert to authenticated
  with check (is_workspace_member(workspace_id) or exists (select 1 from workspaces w where w.id = workspace_id and w.created_by = auth.uid()));
drop policy if exists "wi_delete" on workspace_invites;
create policy "wi_delete" on workspace_invites for delete to authenticated
  using (is_workspace_member(workspace_id) or invited_by = auth.uid());

-- Widen meetings read/write to workspace members
drop policy if exists "meetings_read" on meetings;
create policy "meetings_read" on meetings for select
  using (user_id is null or auth.uid() = user_id or is_workspace_member(workspace_id));
drop policy if exists "meetings_update" on meetings;
create policy "meetings_update" on meetings for update to authenticated
  using (auth.uid() = user_id or is_workspace_member(workspace_id))
  with check (auth.uid() = user_id or is_workspace_member(workspace_id));
drop policy if exists "meetings_insert" on meetings;
create policy "meetings_insert" on meetings for insert to authenticated
  with check (auth.uid() = user_id and (workspace_id is null or is_workspace_member(workspace_id) or exists (select 1 from workspaces w where w.id = workspace_id and w.created_by = auth.uid())));

-- Child tables: visibility/write follows the parent meeting
do $$
declare t text;
begin
  foreach t in array array['transcripts','minutes_drafts','resolutions','action_items','audit_logs'] loop
    execute format('drop policy if exists "%s_read" on %I', t, t);
    execute format('create policy "%s_read" on %I for select using (user_id is null or auth.uid() = user_id or can_access_meeting(meeting_id))', t, t);
    execute format('drop policy if exists "%s_insert" on %I', t, t);
    execute format('create policy "%s_insert" on %I for insert to authenticated with check (auth.uid() = user_id and can_access_meeting(meeting_id))', t, t);
    execute format('drop policy if exists "%s_update" on %I', t, t);
    execute format('create policy "%s_update" on %I for update to authenticated using (auth.uid() = user_id or can_access_meeting(meeting_id)) with check (auth.uid() = user_id or can_access_meeting(meeting_id))', t, t);
  end loop;
end $$;

-- Accept pending workspace invites on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  insert into public.workspace_members (workspace_id, user_id, role)
  select wi.workspace_id, new.id, 'member' from public.workspace_invites wi
  where lower(wi.email) = lower(new.email)
  on conflict do nothing;
  delete from public.workspace_invites where lower(email) = lower(new.email);
  return new;
end;
$$;

-- Precedent matching: trigram index over resolutions a user can already see (RLS applies at query time)
create index if not exists resolutions_text_trgm on resolutions using gin (resolution_text gin_trgm_ops);

-- Review shares: token-gated read-only access to a draft (send_draft_for_review)
create table if not exists review_shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  draft_id uuid not null references minutes_drafts(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
alter table review_shares enable row level security;
drop policy if exists "rs_insert" on review_shares;
create policy "rs_insert" on review_shares for insert to authenticated
  with check (created_by = auth.uid() and can_access_meeting(meeting_id));
drop policy if exists "rs_read" on review_shares;
create policy "rs_read" on review_shares for select
  using (created_by = auth.uid() or can_access_meeting(meeting_id));
drop policy if exists "rs_delete" on review_shares;
create policy "rs_delete" on review_shares for delete to authenticated
  using (created_by = auth.uid());

-- Token lookup for anonymous reviewers (bypasses RLS deliberately, token is the credential)
create or replace function get_shared_draft(share_token text)
returns table (
  company_name text, meeting_type text, meeting_date date, venue text,
  body_html text, body_html_source text, status text, version integer, expires_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select m.company_name, m.meeting_type, m.meeting_date, m.venue,
         d.body_html, d.body_html_source, d.status, d.version, rs.expires_at
  from review_shares rs
  join minutes_drafts d on d.id = rs.draft_id
  join meetings m on m.id = rs.meeting_id
  where rs.token = share_token and rs.expires_at > now();
$$;
