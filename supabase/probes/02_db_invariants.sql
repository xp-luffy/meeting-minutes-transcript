-- =====================================================================
-- PROBE 02 — DB INVARIANTS
-- =====================================================================
-- Read-only. Plants nothing, so it needs no transaction. Safe to run
-- against production on every deploy; takes well under a second.
--
-- This is the probe that catches a NEW TABLE added during the expansion
-- without its tenancy wiring — the single most likely way the boundary
-- gets breached from here. It is deliberately written so that ADDING a
-- table makes it fail until the table is either wired up or explicitly
-- exempted below.
--
-- Every row carries a verdict. Any row not 'PASS' is a stop-ship.
-- =====================================================================

-- Tables that legitimately have no `org_id`. Anything not listed here and
-- not carrying org_id will be reported. Keep this list SHORT and justified.
with exempt(table_name, why) as (values
  ('organisations',      'IS the tenant'),
  ('profiles',           'one row per auth user, owner-scoped'),
  ('gs_outbox',          'RLS deny-all, service_role only; carries workspace not org_id'),
  ('schema_migrations',  'infrastructure')
),
domain_tables as (
  select t.tablename
  from pg_tables t
  where t.schemaname='public'
    and t.tablename not like 'pg_%'
    and t.tablename not in (select table_name from exempt)
),

-- INV-1: RLS is actually ENABLED. A policy on a table with RLS off is decoration.
inv1 as (
  select 1 as id, 'INV-1 RLS enabled on every public table' as probe,
         coalesce(string_agg(c.relname, ', '), 'none') as detail,
         case when count(*)=0 then 'PASS' else '*** RLS OFF ***' end as verdict
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
),

-- INV-2: every table carrying org_id has NOT NULL + a DEFAULT.
-- Scar 4: NOT NULL without a DEFAULT breaks every INSERT at runtime while
-- typecheck and build stay green.
inv2 as (
  select 2, 'INV-2 org_id is NOT NULL and DEFAULTed',
         coalesce(string_agg(c.table_name||' ('||
           case when c.is_nullable='YES' then 'nullable' else 'no default' end||')', ', '), 'none'),
         case when count(*)=0 then 'PASS' else '*** BROKEN INSERT PATH ***' end
  from information_schema.columns c
  where c.table_schema='public' and c.column_name='org_id'
    and c.table_name in (select tablename from domain_tables)
    and (c.is_nullable='YES' or c.column_default is null)
    -- membership/credential tables are written server-side with an explicit
    -- org_id and deliberately have no default.
    and c.table_name not in ('organisation_members','organisation_invites','gs_settings','gs_settings_audit')
),

-- INV-3: every org_id table carries the RESTRICTIVE org_isolation policy.
-- Restrictive is what makes the boundary un-widenable by construction; a
-- permissive-only table is defended by its own policy text alone.
inv3 as (
  select 3, 'INV-3 RESTRICTIVE org_isolation on every org_id table',
         coalesce(string_agg(c.table_name, ', '), 'none'),
         case when count(*)=0 then 'PASS' else '*** UNPROTECTED ***' end
  from information_schema.columns c
  where c.table_schema='public' and c.column_name='org_id'
    and c.table_name in (select tablename from domain_tables)
    and c.table_name not in ('organisation_members','organisation_invites','gs_settings','gs_settings_audit')
    and not exists (
      select 1 from pg_policies p
      where p.schemaname='public' and p.tablename=c.table_name
        and p.policyname='org_isolation' and p.permissive='RESTRICTIVE')
),

-- INV-4: a new table with NO org_id at all. The expansion's likeliest hole.
inv4 as (
  select 4, 'INV-4 no un-tenanted new tables',
         coalesce(string_agg(d.tablename, ', '), 'none'),
         case when count(*)=0 then 'PASS' else '*** UN-TENANTED TABLE ***' end
  from domain_tables d
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=d.tablename and c.column_name='org_id')
),

-- INV-5: one login = one organisation (migration 0039). Load-bearing:
-- current_org_id() silently misfiles records if this ever relaxes.
inv5 as (
  select 5, 'INV-5 one-org-per-user unique index present',
         coalesce((select indexdef from pg_indexes
                   where schemaname='public'
                     and indexname='organisation_members_one_org_per_user'),'ABSENT'),
         case when exists (select 1 from pg_indexes
                where schemaname='public'
                  and indexname='organisation_members_one_org_per_user')
              then 'PASS' else '*** current_org_id() IS NOW AMBIGUOUS ***' end
),

-- INV-6: and that no data already violates it.
inv6 as (
  select 6, 'INV-6 no user actually holds two memberships',
         coalesce((select string_agg(user_id::text, ', ') from (
            select user_id from public.organisation_members
            group by user_id having count(*)>1) x), 'none'),
         case when exists (select 1 from (
                select user_id from public.organisation_members
                group by user_id having count(*)>1) y)
              then '*** MISFILING IN PROGRESS ***' else 'PASS' end
),

-- INV-7: every SECURITY DEFINER function has a pinned search_path.
-- Scar 3 / migration 0023: an unpinned definer function is a privilege
-- escalation waiting for a schema it did not expect.
inv7 as (
  select 7, 'INV-7 SECURITY DEFINER functions pin search_path',
         coalesce(string_agg(p.proname, ', '), 'none'),
         case when count(*)=0 then 'PASS' else '*** UNPINNED DEFINER ***' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) cfg
                    where cfg like 'search_path=%')
),

-- INV-8: no SECURITY DEFINER function calls a function that no longer exists.
-- Scar 6: dropping a function still called by a definer function raises no
-- compile error and breaks only the anonymous production path.
inv8 as (
  select 8, 'INV-8 definer functions reference only live functions',
         coalesce(string_agg(distinct p.proname||' -> '||m[1], ', '), 'none'),
         case when count(*)=0 then 'PASS' else '*** DANGLING CALL ***' end
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace,
  lateral regexp_matches(p.prosrc, 'public\.([a-z_][a-z0-9_]*)\s*\(', 'g') m
  where n.nspname='public' and p.prosecdef
    and not exists (
      select 1 from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
      where n2.nspname='public' and p2.proname = m[1])
    and not exists (
      select 1 from pg_tables t where t.schemaname='public' and t.tablename = m[1])
),

-- INV-9: gs_outbox must stay deny-all. It is written with the service-role
-- key; a single permissive policy here would let a tenant forge another
-- tenant's events, and filed events have no undo.
inv9 as (
  select 9, 'INV-9 gs_outbox has zero RLS policies (deny-all)',
         (select count(*)::text from pg_policies
          where schemaname='public' and tablename='gs_outbox')||' policy/policies',
         case when (select count(*) from pg_policies
                    where schemaname='public' and tablename='gs_outbox')=0
              then 'PASS' else '*** OUTBOX WRITABLE BY A TENANT ***' end
),

-- INV-10: repo/DB migration drift. Scar 8: migrations applied via MCP are
-- NOT written to supabase/migrations/ automatically.
inv10 as (
  select 10, 'INV-10 newest applied migration (compare to repo by eye)',
         (select max(version)||'  '||max(name) from supabase_migrations.schema_migrations),
         'MANUAL: must match the highest-numbered file in supabase/migrations/'
)

select * from inv1 union all select * from inv2 union all select * from inv3
union all select * from inv4 union all select * from inv5 union all select * from inv6
union all select * from inv7 union all select * from inv8 union all select * from inv9
union all select * from inv10
order by 1;
