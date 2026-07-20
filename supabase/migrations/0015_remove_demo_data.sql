-- 0015 — remove the public demo library entirely.
--
-- The app is going internal with real client matters. Login is now just login:
-- no anonymous browsing, and a signed-in user sees only their own work plus
-- workspaces they belong to. /review/[token] stays public — that is the
-- anonymous confirmation link a director opens from an email.
--
-- Order matters: policies stop referencing is_demo first, then the demo rows
-- go, then the column is dropped.

-- 1. Read policies drop the public-demo clause, leaving owner + workspace
--    access exactly as before. Note Postgres normalises `(is_demo)` to a bare
--    `is_demo` in pg_get_expr, so the match is on `is_demo OR ` — matching the
--    parenthesised form silently changes nothing and the column drop then
--    fails on the still-dependent policy.
do $$
declare r record; new_expr text;
begin
  for r in
    select c.relname as tbl, p.polname as pol,
           pg_get_expr(p.polqual, p.polrelid) as expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where p.polcmd = 'r'
      and pg_get_expr(p.polqual, p.polrelid) ilike '%is_demo%'
  loop
    new_expr := replace(r.expr, 'is_demo OR ', '');
    execute format('drop policy %I on %I', r.pol, r.tbl);
    execute format('create policy %I on %I for select using (%s)', r.pol, r.tbl, new_expr);
  end loop;
end $$;

-- 2. ADOPT before deleting. Real work was built on top of demo records
--    (Nusantara Ventures Sdn Bhd carries one demo meeting AND one real one).
--    Deleting those would orphan the user's own meetings, so anything a
--    surviving meeting depends on becomes theirs instead.
update companies c
   set is_demo = false,
       user_id = coalesce(
         c.user_id,
         (select m.user_id from meetings m
           where m.company_id = c.id and not m.is_demo and m.user_id is not null
           limit 1))
 where c.is_demo
   and exists (select 1 from meetings m where m.company_id = c.id and not m.is_demo);

update entities e
   set is_demo = false,
       user_id = coalesce(
         e.user_id,
         (select m.user_id from entity_links l
             join meetings m on m.id = l.meeting_id
           where l.entity_id = e.id and not m.is_demo and m.user_id is not null
           limit 1))
 where e.is_demo
   and exists (select 1 from entity_links l join meetings m on m.id = l.meeting_id
                where l.entity_id = e.id and not m.is_demo);

-- 3. Delete demo content, children before parents.
delete from entity_links      where is_demo or meeting_id in (select id from meetings where is_demo);
delete from resolutions       where is_demo or meeting_id in (select id from meetings where is_demo);
delete from action_items      where is_demo or meeting_id in (select id from meetings where is_demo);
delete from obligations       where is_demo or meeting_id in (select id from meetings where is_demo);
delete from assurance_reports where is_demo or meeting_id in (select id from meetings where is_demo);
delete from audit_logs        where is_demo or meeting_id in (select id from meetings where is_demo);
delete from minutes_drafts    where is_demo or meeting_id in (select id from meetings where is_demo);
delete from transcripts       where is_demo or meeting_id in (select id from meetings where is_demo);
delete from meetings          where is_demo;
delete from entities          where is_demo;
delete from companies         where is_demo;

-- 3. The flag has no further purpose.
alter table meetings          drop column if exists is_demo;
alter table transcripts       drop column if exists is_demo;
alter table minutes_drafts    drop column if exists is_demo;
alter table resolutions       drop column if exists is_demo;
alter table action_items      drop column if exists is_demo;
alter table companies         drop column if exists is_demo;
alter table entities          drop column if exists is_demo;
alter table entity_links      drop column if exists is_demo;
alter table audit_logs        drop column if exists is_demo;
alter table obligations       drop column if exists is_demo;
alter table assurance_reports drop column if exists is_demo;
