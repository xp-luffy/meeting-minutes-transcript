-- V3: the graph/obligation engine — entities (nodes), entity_links (edges),
-- obligations (derived statutory duties). See docs/PLAN_V3.md.
-- Schema applied via migration graph_obligation_engine; backfill (idempotent,
-- guarded by NOT EXISTS) seeds the graph from existing meetings/companies.

create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  workspace_id uuid references workspaces(id),
  kind text not null default 'person' check (kind in ('person','org')),
  canonical_name text not null,
  normalized_name text not null,
  aliases jsonb not null default '[]',
  reg_no text,
  created_at timestamptz not null default now()
);
alter table entities enable row level security;
drop policy if exists "entities_read" on entities;
create policy "entities_read" on entities for select
  using (user_id is null or (select auth.uid()) = user_id or is_workspace_member(workspace_id));
drop policy if exists "entities_insert" on entities;
create policy "entities_insert" on entities for insert to authenticated
  with check ((select auth.uid()) = user_id and (workspace_id is null or is_workspace_member(workspace_id) or exists (select 1 from workspaces w where w.id = workspace_id and w.created_by = (select auth.uid()))));
drop policy if exists "entities_update" on entities;
create policy "entities_update" on entities for update to authenticated
  using ((select auth.uid()) = user_id or is_workspace_member(workspace_id))
  with check ((select auth.uid()) = user_id or is_workspace_member(workspace_id));

create table if not exists entity_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  entity_id uuid not null references entities(id) on delete cascade,
  target_type text not null check (target_type in ('meeting','company','resolution','action_item','entity')),
  target_id uuid not null,
  relation text not null,
  meeting_id uuid references meetings(id) on delete cascade,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now()
);
alter table entity_links enable row level security;
drop policy if exists "entity_links_read" on entity_links;
create policy "entity_links_read" on entity_links for select
  using (user_id is null or (select auth.uid()) = user_id or (meeting_id is not null and can_access_meeting(meeting_id)));
drop policy if exists "entity_links_insert" on entity_links;
create policy "entity_links_insert" on entity_links for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "entity_links_update" on entity_links;
create policy "entity_links_update" on entity_links for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "entity_links_delete" on entity_links;
create policy "entity_links_delete" on entity_links for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  resolution_id uuid references resolutions(id) on delete set null,
  kind text not null default 'custom',
  title text not null,
  detail text,
  due_date date,
  status text not null default 'open' check (status in ('open','done','waived')),
  source text,
  created_at timestamptz not null default now()
);
alter table obligations enable row level security;
drop policy if exists "obligations_read" on obligations;
create policy "obligations_read" on obligations for select
  using (user_id is null or (select auth.uid()) = user_id or can_access_meeting(meeting_id));
drop policy if exists "obligations_insert" on obligations;
create policy "obligations_insert" on obligations for insert to authenticated
  with check ((select auth.uid()) = user_id and can_access_meeting(meeting_id));
drop policy if exists "obligations_update" on obligations;
create policy "obligations_update" on obligations for update to authenticated
  using ((select auth.uid()) = user_id or can_access_meeting(meeting_id))
  with check ((select auth.uid()) = user_id or can_access_meeting(meeting_id));
drop policy if exists "obligations_delete" on obligations;
create policy "obligations_delete" on obligations for delete to authenticated
  using ((select auth.uid()) = user_id or can_access_meeting(meeting_id));

create index if not exists idx_entities_scope_norm on entities (user_id, workspace_id, normalized_name);
create index if not exists idx_entities_norm_trgm on entities using gin (normalized_name extensions.gin_trgm_ops);
create index if not exists idx_entity_links_entity on entity_links (entity_id);
create index if not exists idx_entity_links_target on entity_links (target_type, target_id);
create index if not exists idx_entity_links_meeting on entity_links (meeting_id);
create index if not exists idx_obligations_meeting on obligations (meeting_id);
create index if not exists idx_obligations_status_due on obligations (status, due_date);
create index if not exists idx_obligations_user on obligations (user_id);

-- ── Backfill (idempotent): seed nodes + edges from existing data ───────────
-- person entities from attendees
insert into entities (user_id, workspace_id, kind, canonical_name, normalized_name)
select distinct on (m.user_id, m.workspace_id, n.norm)
  m.user_id, m.workspace_id, 'person', (a->>'name'), n.norm
from meetings m
cross join lateral jsonb_array_elements(coalesce(m.attendees,'[]'::jsonb)) a
cross join lateral (select trim(regexp_replace(lower(a->>'name'),
  '^(dato''?|datuk|tan sri|puan sri|datin|encik|mr|ms|mrs|dr|tuan|haji|hajah)[\s.]+','','i')) as norm) n
where (a->>'name') is not null and length(trim(a->>'name')) > 1 and n.norm <> ''
  and lower(a->>'name') not in ('shareholders','various','members')
  and not exists (select 1 from entities e where e.kind='person' and e.normalized_name = n.norm
    and e.user_id is not distinct from m.user_id and e.workspace_id is not distinct from m.workspace_id)
order by m.user_id, m.workspace_id, n.norm, m.created_at;

-- org entities from companies
insert into entities (user_id, workspace_id, kind, canonical_name, normalized_name, reg_no)
select c.user_id, c.workspace_id, 'org', c.name, lower(trim(c.name)), c.reg_no
from companies c
where not exists (select 1 from entities e where e.kind='org' and e.normalized_name = lower(trim(c.name))
  and e.user_id is not distinct from c.user_id and e.workspace_id is not distinct from c.workspace_id);

-- person → meeting (attended/chaired)
insert into entity_links (user_id, entity_id, target_type, target_id, relation, meeting_id)
select m.user_id, e.id, 'meeting', m.id,
  case when lower(coalesce(a->>'role','')) ~ 'chair' then 'chaired' else 'attended' end, m.id
from meetings m
cross join lateral jsonb_array_elements(coalesce(m.attendees,'[]'::jsonb)) a
cross join lateral (select trim(regexp_replace(lower(a->>'name'),
  '^(dato''?|datuk|tan sri|puan sri|datin|encik|mr|ms|mrs|dr|tuan|haji|hajah)[\s.]+','','i')) as norm) n
join entities e on e.kind='person' and e.normalized_name = n.norm
  and e.user_id is not distinct from m.user_id and e.workspace_id is not distinct from m.workspace_id
where (a->>'name') is not null and n.norm <> ''
  and not exists (select 1 from entity_links l where l.entity_id=e.id and l.target_type='meeting' and l.target_id=m.id);

-- person → company (directorship graph)
insert into entity_links (user_id, entity_id, target_type, target_id, relation, meeting_id)
select distinct on (e.id, m.company_id) m.user_id, e.id, 'company', m.company_id,
  case when lower(coalesce(a->>'role','')) ~ 'chair' then 'chairman'
       when lower(coalesce(a->>'role','')) ~ 'secretar' then 'secretary'
       when lower(coalesce(a->>'role','')) ~ 'director' then 'director'
       when lower(coalesce(a->>'role','')) ~ 'shareholder' then 'shareholder'
       when lower(coalesce(a->>'role','')) ~ 'member' then 'member'
       else 'associated' end, m.id
from meetings m
cross join lateral jsonb_array_elements(coalesce(m.attendees,'[]'::jsonb)) a
cross join lateral (select trim(regexp_replace(lower(a->>'name'),
  '^(dato''?|datuk|tan sri|puan sri|datin|encik|mr|ms|mrs|dr|tuan|haji|hajah)[\s.]+','','i')) as norm) n
join entities e on e.kind='person' and e.normalized_name = n.norm
  and e.user_id is not distinct from m.user_id and e.workspace_id is not distinct from m.workspace_id
where m.company_id is not null and n.norm <> ''
  and not exists (select 1 from entity_links l where l.entity_id=e.id and l.target_type='company' and l.target_id=m.company_id)
order by e.id, m.company_id, m.created_at;

-- action-item owners
insert into entity_links (user_id, entity_id, target_type, target_id, relation, meeting_id)
select ai.user_id, e.id, 'action_item', ai.id, 'owner', ai.meeting_id
from action_items ai
join meetings m on m.id = ai.meeting_id
cross join lateral (select trim(regexp_replace(lower(coalesce(ai.owner_name,'')),
  '^(dato''?|datuk|tan sri|puan sri|datin|encik|mr|ms|mrs|dr|tuan|haji|hajah)[\s.]+','','i')) as norm) n
join entities e on e.kind='person' and e.normalized_name = n.norm
  and e.user_id is not distinct from m.user_id and e.workspace_id is not distinct from m.workspace_id
where ai.owner_name is not null and n.norm <> ''
  and not exists (select 1 from entity_links l where l.entity_id=e.id and l.target_type='action_item' and l.target_id=ai.id);
