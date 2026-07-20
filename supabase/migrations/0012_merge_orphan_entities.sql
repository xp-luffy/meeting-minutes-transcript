-- 0012 — merge orphan person entities left by the 0009 backfill.
--
-- 0009 created person rows with user_id = NULL. resolveEntitiesForMeeting
-- scoped candidate lookup strictly to the acting user, so those rows were
-- invisible and every meeting re-created a person who already existed. Found
-- by dogfooding /people: four people (Farah Aziz x3, Roslan bin Hashim,
-- Chen Li Ying, Suresh Kumar) existed as separate records inside the SAME
-- company, splitting directorship history and undermining conflict detection.
--
-- The code fix (lib/entities.ts) stops NEW duplicates. This merges the
-- existing ones: aliases merged, links repointed, only then the orphan
-- removed. Rule-based, not hardcoded ids. Idempotent — re-running is a no-op.

do $$
declare r record;
begin
  for r in
    select l.id as loser, k.id as keeper
    from entities l
    join lateral (
      select k.id
      from entities k
      where k.kind = 'person'
        and k.user_id is not null
        and k.normalized_name = l.normalized_name
        and k.workspace_id is not distinct from l.workspace_id
      order by k.created_at
      limit 1
    ) k on true
    where l.kind = 'person'
      and l.user_id is null
  loop
    -- 1. keeper inherits every alias the orphan carried
    update entities keep
       set aliases = (
         select to_jsonb(array(
           select distinct x
           from jsonb_array_elements_text(
             coalesce(keep.aliases, '[]'::jsonb) || coalesce(lose.aliases, '[]'::jsonb)
           ) x))
       )
      from entities lose
     where keep.id = r.keeper and lose.id = r.loser;

    -- 2. move edges the keeper does not already have
    update entity_links el
       set entity_id = r.keeper
     where el.entity_id = r.loser
       and not exists (
         select 1 from entity_links e2
         where e2.entity_id = r.keeper
           and e2.target_type = el.target_type
           and e2.target_id = el.target_id
       );

    -- 3. anything left on the orphan is a duplicate edge the keeper already has
    delete from entity_links where entity_id = r.loser;

    -- 4. remove the orphan itself
    delete from entities where id = r.loser;
  end loop;
end $$;

-- Prevent recurrence at the schema level: one person per (scope, name).
-- NULLS NOT DISTINCT so a NULL workspace_id/user_id still collides.
create unique index if not exists entities_person_scope_name_uidx
  on entities (kind, normalized_name, user_id, workspace_id)
  nulls not distinct
  where kind = 'person';
