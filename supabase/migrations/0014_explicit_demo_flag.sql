-- 0014 — make "public demo data" explicit instead of inferred from a NULL owner.
--
-- Every read policy began with `user_id IS NULL`, so ANY ownerless row was
-- readable by anyone including anonymous visitors — across meetings,
-- transcripts, minutes_drafts, resolutions, audit_logs and more. That is how
-- the demo library works, and today only demo seed rows are affected.
--
-- The problem is that it fails OPEN: a bug, a backfill, or a future insert
-- that leaves user_id NULL silently publishes real client minutes with no
-- error and no warning. Migration 0009 already produced ownerless rows once
-- (see 0012), so this is not hypothetical.
--
-- Fix: an explicit is_demo flag. Existing ownerless rows are the demo library
-- and stay public; anything ownerless in future is private by default.

alter table meetings          add column if not exists is_demo boolean not null default false;
alter table transcripts       add column if not exists is_demo boolean not null default false;
alter table minutes_drafts    add column if not exists is_demo boolean not null default false;
alter table resolutions       add column if not exists is_demo boolean not null default false;
alter table action_items      add column if not exists is_demo boolean not null default false;
alter table companies         add column if not exists is_demo boolean not null default false;
alter table entities          add column if not exists is_demo boolean not null default false;
alter table entity_links      add column if not exists is_demo boolean not null default false;
alter table audit_logs        add column if not exists is_demo boolean not null default false;
alter table obligations       add column if not exists is_demo boolean not null default false;
alter table assurance_reports add column if not exists is_demo boolean not null default false;

-- The rows that are public TODAY are exactly the demo library.
update meetings          set is_demo = true where user_id is null;
update transcripts       set is_demo = true where user_id is null;
update minutes_drafts    set is_demo = true where user_id is null;
update resolutions       set is_demo = true where user_id is null;
update action_items      set is_demo = true where user_id is null;
update companies         set is_demo = true where user_id is null;
update entities          set is_demo = true where user_id is null;
update entity_links      set is_demo = true where user_id is null;
update audit_logs        set is_demo = true where user_id is null;
update obligations       set is_demo = true where user_id is null;
update assurance_reports set is_demo = true where user_id is null;

-- Swap `user_id IS NULL` for `is_demo` in each read policy, preserving the
-- rest of every expression exactly as written.
do $$
declare r record; new_expr text;
begin
  for r in
    select c.relname as tbl, p.polname as pol,
           pg_get_expr(p.polqual, p.polrelid) as expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where p.polcmd = 'r'
      and pg_get_expr(p.polqual, p.polrelid) ilike '%user_id is null%'
  loop
    new_expr := replace(r.expr, '(user_id IS NULL)', '(is_demo)');
    execute format('drop policy %I on %I', r.pol, r.tbl);
    execute format('create policy %I on %I for select using (%s)', r.pol, r.tbl, new_expr);
  end loop;
end $$;
