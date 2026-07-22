-- =====================================================================
-- PROBE 01 — CROSS-TENANT ISOLATION SUITE
-- =====================================================================
-- Run in the Supabase SQL editor. Copy the WHOLE file including the
-- final `rollback;`.
--
-- DESIGN RULES (each one is a scar, see HANDOFF.md §7):
--   * It SETS A JWT. Running as `postgres` BYPASSES RLS entirely and
--     proves nothing. Every assertion below runs as `authenticated`
--     carrying a real user's `sub` claim.
--   * It RETURNS A RESULT SET. `raise warning` output is discarded by
--     SQL-over-HTTP; a probe that raises is a probe that "passed" while
--     proving nothing (scar 5).
--   * It PLANTS ROWS, so it is wrapped in a transaction and ROLLED BACK.
--   * Every row it returns carries an explicit PASS/LEAK verdict. No
--     human is asked to eyeball a count and decide.
--
-- READ THE `verdict` COLUMN. Any row that is not 'PASS' is a stop-ship.
-- =====================================================================

create or replace function pg_temp.tenant_isolation_probe()
returns table(id int, probe text, detail text, verdict text)
language plpgsql
as $$
declare
  v_home    uuid;   -- the org our test user really belongs to
  v_rival   uuid;   -- a foreign org
  v_user    uuid;   -- a real user, member of v_home
  v_admin   uuid;   -- an admin/owner of v_home
  v_n       int;
  v_co      uuid;
  v_meeting uuid;
begin
  -- ---------------------------------------------------------------
  -- Seed, as superuser (RLS not yet in play).
  -- ---------------------------------------------------------------
  select m.user_id, m.org_id into v_user, v_home
  from public.organisation_members m
  order by m.created_at
  limit 1;

  if v_user is null then
    id:=0; probe:='SEED'; detail:='no organisation_members rows — cannot run'; verdict:='SKIPPED';
    return next; return;
  end if;

  select m.user_id into v_admin
  from public.organisation_members m
  where m.org_id = v_home and m.role in ('owner','admin')
  limit 1;

  insert into public.organisations (name, slug)
  values ('ZZ Probe Rival Firm','zz-probe-rival')
  on conflict (slug) do nothing;
  select o.id into v_rival from public.organisations o where o.slug='zz-probe-rival';

  -- THE STRONGEST CASE: a row the test user OWNS (user_id matches) that
  -- lives in a FOREIGN organisation. If ownership alone still grants
  -- access, the tenant boundary is decorative.
  insert into public.companies (name, user_id, org_id)
  values ('ZZ-PROBE-RIVAL-SECRET-CO', v_user, v_rival)
  returning companies.id into v_co;

  insert into public.meetings (company_id, user_id, org_id, meeting_type, meeting_date, status)
  values (v_co, v_user, v_rival, 'Board Meeting', current_date, 'draft')
  returning meetings.id into v_meeting;

  -- A rival credential. Reading this across tenants is the finding that
  -- started the whole 0027–0039 body of work.
  insert into public.gs_settings (org_id, workspace, source_name, api_key_ciphertext, enabled)
  values (v_rival, 'zz-probe-rival', 'ZZ Probe Source', 'v1.zz.zz.zz', true)
  on conflict do nothing;

  -- ---------------------------------------------------------------
  -- Become the user. Everything below is subject to RLS.
  -- ---------------------------------------------------------------
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role','authenticated')::text, true);

  -- 1. THE OWNERSHIP TRAP -----------------------------------------
  select count(*) into v_n from public.companies c where c.id = v_co;
  id:=1; probe:='read a company I OWN (user_id = me) in a FOREIGN org';
  detail:=v_n||' row(s) visible';
  verdict := case when v_n = 0 then 'PASS' else '*** LEAK ***' end;
  return next;

  select count(*) into v_n from public.meetings m where m.id = v_meeting;
  id:=2; probe:='read a meeting I OWN in a FOREIGN org';
  detail:=v_n||' row(s) visible';
  verdict := case when v_n = 0 then 'PASS' else '*** LEAK ***' end;
  return next;

  -- 2. FOREIGN CREDENTIAL -----------------------------------------
  select count(*) into v_n from public.gs_settings g where g.org_id = v_rival;
  id:=3; probe:='read ANOTHER org''s GroundStream credential';
  detail:=v_n||' credential row(s) visible';
  verdict := case when v_n = 0 then 'PASS' else '*** LEAK ***' end;
  return next;

  select count(*) into v_n from public.gs_settings;
  id:=4; probe:='total gs_settings rows visible to me';
  detail:=v_n||' row(s) (expect only my own org''s, 0 or 1)';
  verdict := case when v_n <= 1 then 'PASS' else '*** LEAK ***' end;
  return next;

  -- 3. WRITE INTO A FOREIGN TENANT --------------------------------
  begin
    insert into public.companies (name, user_id, org_id)
    values ('ZZ-PROBE-FORGED', v_user, v_rival);
    id:=5; probe:='INSERT a company into a foreign org'; detail:='insert succeeded';
    verdict:='*** LEAK ***';
  exception when others then
    id:=5; probe:='INSERT a company into a foreign org'; detail:='refused: '||sqlerrm;
    verdict:='PASS';
  end;
  return next;

  -- 4. MOVE ONE OF MY OWN ROWS INTO A FOREIGN TENANT --------------
  -- Scar 2: an RLS refusal updates 0 rows with NO error. Counting rows
  -- is the ONLY way to tell refusal from success here.
  with moved as (
    update public.companies c set org_id = v_rival
    where c.org_id = v_home
    returning 1
  ) select count(*) into v_n from moved;
  id:=6; probe:='UPDATE one of my own companies INTO a foreign org';
  detail:=v_n||' row(s) moved';
  verdict := case when v_n = 0 then 'PASS' else '*** LEAK ***' end;
  return next;

  -- 5. SELF-JOIN INTO A FOREIGN TENANT ----------------------------
  -- Inner block, NOT a function-level handler: a function-level `exception`
  -- would silently swallow a failure in probes 1-6 and report only this row,
  -- which is exactly the "test passed while proving nothing" shape of scar 5.
  begin
    insert into public.organisation_members (user_id, org_id, role)
    values (v_user, v_rival, 'owner');
    id:=7; probe:='join myself to a foreign org (organisation_members INSERT)';
    detail:='insert succeeded'; verdict:='*** LEAK ***';
  exception
    when unique_violation then
      -- migration 0039: one login = one organisation. This is the LOAD-BEARING
      -- constraint that makes current_org_id() unambiguous. Hitting it here is
      -- the correct outcome and must be reported as such.
      id:=7; probe:='join myself to a foreign org (organisation_members INSERT)';
      detail:='refused by one-org-per-user index: '||sqlerrm; verdict:='PASS';
    when others then
      id:=7; probe:='join myself to a foreign org (organisation_members INSERT)';
      detail:='refused: '||sqlerrm; verdict:='PASS';
  end;
  return next;

  -- 6. THE DEFAULT CANNOT BE STEERED ------------------------------
  -- current_org_id() is the DEFAULT on org_id across 15 tables. If a caller
  -- omits org_id the row must land in THEIR org, never anywhere else.
  insert into public.companies (name, user_id) values ('ZZ-PROBE-DEFAULT', v_user)
  returning companies.org_id into v_co;
  id:=8; probe:='org_id DEFAULT stamps my own org when omitted';
  detail:='landed in '||coalesce(v_co::text,'NULL')||', home is '||v_home::text;
  verdict := case when v_co = v_home then 'PASS' else '*** MISFILED ***' end;
  return next;
end $$;

-- ---------------------------------------------------------------------
-- The ADMIN variant. `org_admin_read` (0037/0038) is the ONLY widening in
-- the tenancy work; it is the policy most likely to be over-broad.
-- ---------------------------------------------------------------------
create or replace function pg_temp.admin_isolation_probe()
returns table(id int, probe text, detail text, verdict text)
language plpgsql
as $$
declare
  v_admin uuid; v_home uuid; v_rival uuid; v_n int; v_co uuid;
begin
  select m.user_id, m.org_id into v_admin, v_home
  from public.organisation_members m
  where m.role in ('owner','admin')
  limit 1;

  if v_admin is null then
    id:=0; probe:='SEED'; detail:='no org admin exists'; verdict:='SKIPPED'; return next; return;
  end if;

  insert into public.organisations (name, slug)
  values ('ZZ Probe Rival Firm','zz-probe-rival') on conflict (slug) do nothing;
  select o.id into v_rival from public.organisations o where o.slug='zz-probe-rival';

  insert into public.companies (name, user_id, org_id)
  values ('ZZ-PROBE-ADMIN-TARGET', v_admin, v_rival) returning companies.id into v_co;

  insert into public.gs_settings (org_id, workspace, source_name, api_key_ciphertext, enabled)
  values (v_rival,'zz-probe-rival','ZZ','v1.zz.zz.zz',true) on conflict do nothing;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role','authenticated')::text, true);

  select count(*) into v_n from public.companies c where c.org_id = v_rival;
  id:=10; probe:='ORG ADMIN reads a foreign org''s companies';
  detail:=v_n||' row(s)';
  verdict := case when v_n=0 then 'PASS' else '*** LEAK — org_admin_read is too broad ***' end;
  return next;

  -- gs_settings is the ONE sensitive table with NO restrictive org_isolation
  -- backstop; it is defended solely by is_org_admin(org_id) on the permissive
  -- policy. That makes this the single most important assertion in the suite.
  select count(*) into v_n from public.gs_settings g where g.org_id = v_rival;
  id:=11; probe:='ORG ADMIN reads a foreign org''s GroundStream credential';
  detail:=v_n||' credential row(s)';
  verdict := case when v_n=0 then 'PASS' else '*** LEAK — tenant write-credential exposed ***' end;
  return next;

  with upd as (
    update public.gs_settings g set enabled=false where g.org_id=v_rival returning 1
  ) select count(*) into v_n from upd;
  id:=12; probe:='ORG ADMIN disables a foreign org''s GroundStream connection';
  detail:=v_n||' row(s) updated';
  verdict := case when v_n=0 then 'PASS' else '*** LEAK ***' end;
  return next;

  select count(*) into v_n from public.gs_settings_audit a where a.org_id = v_rival;
  id:=13; probe:='ORG ADMIN reads a foreign org''s credential AUDIT trail';
  detail:=v_n||' row(s)';
  verdict := case when v_n=0 then 'PASS' else '*** LEAK ***' end;
  return next;
end $$;

-- =====================================================================
-- RUN. The rollback is not optional — the probes plant real rows.
-- =====================================================================
begin;
  select * from pg_temp.tenant_isolation_probe()
  union all
  select * from pg_temp.admin_isolation_probe()
  order by id;
rollback;
