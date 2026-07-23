-- 0043 — the module foundation. SCHEMA ONLY. No behaviour changes.
--
-- Step 1 of turning a single-vertical app (company secretarial) into a module
-- system where a second vertical (professional services) is a config file, not
-- a fork. Nothing in the application reads these columns yet — this migration
-- is a strict no-op, verified by comparing meeting counts grouped by the
-- derived type against the same counts taken through the live
-- meetingTypeCategory() before applying it: board(4), committee(3), agm(1),
-- reproduced exactly.
--
-- modules and meeting_types are DEPLOYMENT-LEVEL catalogue, the ONE deliberate
-- exception to the org_id-on-every-table rule (0029/0030): a module is code
-- that ships with the deployment, identical for every tenant. Both are readable
-- by any authenticated user and writable by NOBODY through the API — RLS denies
-- writes by default; only a migration seeds them.

create table if not exists public.modules (
  id         text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  label      text not null,
  created_at timestamptz not null default now()
);
alter table public.modules enable row level security;
drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules for select to authenticated using (true);

insert into public.modules (id, label) values
  ('cosec','Company Secretarial'),
  ('consulting','Professional Services')
on conflict (id) do nothing;

-- Identity only. Labels, headings, prefixes and check lists live in
-- lib/modules/<id>/ in TypeScript, where they get typecheck and unit tests.
-- This table exists so a composite FK can reject a typo'd type at the lowest
-- rung, which substring matching cannot. Keep the seed here in lockstep with
-- scripts/probes/module-registry.ts, which mirrors it.
create table if not exists public.meeting_types (
  module_id text not null references public.modules(id) on delete cascade,
  type_id   text not null check (type_id ~ '^[a-z][a-z0-9_]{1,30}$'),
  primary key (module_id, type_id)
);
alter table public.meeting_types enable row level security;
drop policy if exists meeting_types_read on public.meeting_types;
create policy meeting_types_read on public.meeting_types for select to authenticated using (true);

insert into public.meeting_types (module_id, type_id) values
  ('cosec','board'),('cosec','agm'),('cosec','egm'),('cosec','audit'),('cosec','committee'),
  ('consulting','discovery'),('consulting','kickoff'),('consulting','status'),
  ('consulting','qbr'),('consulting','escalation')
on conflict do nothing;

alter table public.organisations add column if not exists default_module_id text
  references public.modules(id);
update public.organisations set default_module_id = 'cosec' where default_module_id is null;
alter table public.organisations alter column default_module_id set not null;
alter table public.organisations alter column default_module_id set default 'cosec';

-- The FACT of which module produced a meeting, stamped at creation and never
-- changed: a firm that later switches modules must not retroactively
-- reinterpret history. This is also what lets ONE org run both verticals
-- despite one-login-one-org — the module rides on the meeting, not membership.
alter table public.meetings add column if not exists module_id text
  references public.modules(id);
update public.meetings set module_id = 'cosec' where module_id is null;
alter table public.meetings alter column module_id set not null;
alter table public.meetings alter column module_id set default 'cosec';
create index if not exists meetings_module_idx on public.meetings(module_id);

-- Structured meeting type, backfilled with the EXACT precedence
-- meetingTypeCategory() uses today. meetings.meeting_type (free text) is KEPT as
-- the human label shown in ~15 render sites; it stops being a dispatch key.
alter table public.meetings add column if not exists meeting_type_id text;
update public.meetings set meeting_type_id = case
  when lower(meeting_type) like '%audit%' then 'audit'
  when lower(meeting_type) like '%agm%' or lower(meeting_type) like '%annual general%' then 'agm'
  when lower(meeting_type) like '%egm%' or lower(meeting_type) like '%extraordinary%' then 'egm'
  when lower(meeting_type) like '%board%' then 'board'
  else 'committee'
end
where meeting_type_id is null;
alter table public.meetings alter column meeting_type_id set not null;
alter table public.meetings
  add constraint meetings_meeting_type_fk
  foreign key (module_id, meeting_type_id) references public.meeting_types(module_id, type_id);
create index if not exists meetings_type_idx on public.meetings(module_id, meeting_type_id);
