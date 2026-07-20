-- 0017 — action item owners become real people.
--
-- `action_items.owner_name` is free text, so the app cannot notify anyone,
-- cannot answer "what does this person owe me across all companies", and
-- cannot tell "Finance" (a role) from "Ms Tan" (a person).
--
-- This adds an OVERLAY link to a person entity. It does NOT replace
-- `owner_name`: owner_name is what the minutes literally say and the minutes
-- are the statutory record. A later linking decision must never rewrite the
-- document. So there are THREE representable, distinguishable states:
--
--   linked               owner_entity_id IS NOT NULL
--   named, not linked    owner_entity_id IS NULL     AND owner_name is non-blank
--   unassigned           owner_entity_id IS NULL     AND owner_name IS NULL/blank
--
-- `on delete set null` is deliberate: if the person entity is deleted or
-- merged away (see 0012), the item falls back to "named, not linked" with the
-- recorded text intact. It never silently becomes "unassigned", and it never
-- blocks the delete.

-- ── 1. The link column + indexes ──────────────────────────────────────────

alter table action_items
  add column if not exists owner_entity_id uuid references entities(id) on delete set null;

-- "what does this person owe me, across all companies" — the whole point.
create index if not exists idx_action_items_owner_entity
  on action_items (owner_entity_id, item_status, due_date)
  where owner_entity_id is not null;

-- the unassigned/needs-an-owner queue: everything with no link, ordered the
-- way the queue renders it. Partial, so it stays small as items get linked.
create index if not exists idx_action_items_owner_unlinked
  on action_items (item_status, due_date)
  where owner_entity_id is null;

-- Make the three states EXACTLY representable. A whitespace-only owner_name
-- carries no information but would classify as "named, not linked" — hiding
-- an item inside the wrong bucket of the queue built to find it. The write
-- path already normalises blanks to NULL (updateActionItemField); this brings
-- any legacy row into line so `owner_name IS NULL` is a sound test for
-- "unassigned". No non-blank recorded text is touched.
update action_items
   set owner_name = null
 where owner_name is not null
   and length(trim(owner_name)) = 0;

-- ── 2. RLS: bind BOTH sides of the new relationship ───────────────────────
--
-- The existing write policies (0004) only constrain user_id / meeting access.
-- With a new FK that is not enough: a caller who legitimately owns an action
-- item could point it at ANOTHER tenant's `entities` row — forging a
-- cross-tenant edge exactly the way entity_links could be forged before 0010
-- (docs/PILOT_PLAYBOOK.md pattern E, ledger #8). The WITH CHECK below binds
-- the entity side as well, using the same inline `exists` shape 0010
-- established. USING is left exactly as 0004 had it so read/edit access to
-- existing rows is unchanged.
--
-- Known trade-off: WITH CHECK sees only the NEW row, so it cannot tell "the
-- link is being changed" from "the link was already there". If a user is
-- later removed from the workspace that owns a linked person, ANY update to
-- that action item (including a plain done/undone toggle) is refused until
-- the owner is re-pointed. That fails LOUDLY — the server actions return the
-- error to the user — which is the correct direction for a legal record. The
-- precise alternative is an OLD/NEW-comparing trigger; it is deliberately not
-- used here because the policy is the guarantee the audit asks for.

drop policy if exists "action_items_insert" on action_items;
create policy "action_items_insert" on action_items for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and can_access_meeting(meeting_id)
    and (
      action_items.owner_entity_id is null
      or exists (
        select 1 from entities e
        where e.id = action_items.owner_entity_id
          and e.kind = 'person'
          and (e.user_id = (select auth.uid()) or is_workspace_member(e.workspace_id))
      )
    )
  );

drop policy if exists "action_items_update" on action_items;
create policy "action_items_update" on action_items for update to authenticated
  using ((select auth.uid()) = user_id or can_access_meeting(meeting_id))
  with check (
    ((select auth.uid()) = user_id or can_access_meeting(meeting_id))
    and (
      action_items.owner_entity_id is null
      or exists (
        select 1 from entities e
        where e.id = action_items.owner_entity_id
          and e.kind = 'person'
          and (e.user_id = (select auth.uid()) or is_workspace_member(e.workspace_id))
      )
    )
  );

-- ── 3. Name tokens (shared by the picker and the unlinked-match detector) ──
--
-- Deliberately recall-biased. This feeds a WARNING ("N further items name
-- someone who looks like this person"), and for a warning a false negative is
-- the dangerous direction: it makes an incomplete page look complete. Only
-- honorifics and connectives are dropped; surnames that double as honorific
-- fragments (e.g. "Tan") are KEPT, accepting the occasional false positive.

create or replace function person_name_tokens(p_name text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct t), '{}'::text[])
  from unnest(
    string_to_array(
      trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')),
      ' '
    )
  ) as t
  where length(t) >= 3
    and t not in (
      'bin','binti','bte','the','and','for','dato','datuk','datin',
      'encik','puan','tuan','haji','hajah','mrs','dr','prof'
    );
$$;

-- ── 4. Owner picker candidate search ──────────────────────────────────────
--
-- SECURITY INVOKER (the 0016 pattern) — every base table is filtered by the
-- caller's own RLS, so this grants no visibility the user did not already
-- have. Matches canonical_name AND aliases (aliases live in jsonb, which
-- PostgREST cannot express as a substring filter — that is why this is an
-- RPC rather than a client-built query).
--
-- Bounding: the LIMIT trims a set that is ALREADY the set of matches, never
-- an unfiltered table (contrast the detectConflicts limit(200) bug —
-- PILOT_PLAYBOOK #7 / pattern D). With an empty query it is an explicit
-- "browse people, company first" list, not a filtered search.
--
-- It returns evidence (company relation, meeting count, aliases, exact-match
-- flag) because the caller MUST show it: a bare list of names is how the
-- wrong Aisyah gets assigned. It never links anything itself.

create or replace function search_owner_candidates(
  p_query text,
  p_company_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  canonical_name text,
  aliases jsonb,
  at_company boolean,
  company_relation text,
  meeting_count bigint,
  exact_match boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select nullif(trim(coalesce(p_query, '')), '') as raw
  ),
  pat as (
    select
      q.raw,
      case
        when q.raw is null then null
        else '%' || replace(replace(replace(q.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as like_pat
    from q
  ),
  people as (
    select e.id, e.canonical_name, coalesce(e.aliases, '[]'::jsonb) as aliases, p.raw
    from entities e
    cross join pat p
    where e.kind = 'person'
      and (
        p.like_pat is null
        or e.canonical_name ilike p.like_pat
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(e.aliases, '[]'::jsonb)) as al(value)
          where al.value ilike p.like_pat
        )
      )
  ),
  scored as (
    select
      pp.id,
      pp.canonical_name,
      pp.aliases,
      (cl.relation is not null) as at_company,
      cl.relation as company_relation,
      coalesce(mc.n, 0) as meeting_count,
      (
        pp.raw is not null
        and (
          lower(pp.canonical_name) = lower(pp.raw)
          or exists (
            select 1 from jsonb_array_elements_text(pp.aliases) as al(value)
            where lower(al.value) = lower(pp.raw)
          )
        )
      ) as exact_match
    from people pp
    left join lateral (
      select l.relation
      from entity_links l
      where p_company_id is not null
        and l.entity_id = pp.id
        and l.target_type = 'company'
        and l.target_id = p_company_id
      limit 1
    ) cl on true
    left join lateral (
      select count(distinct l.target_id) as n
      from entity_links l
      where l.entity_id = pp.id and l.target_type = 'meeting'
    ) mc on true
  )
  select
    s.id, s.canonical_name, s.aliases, s.at_company,
    s.company_relation, s.meeting_count, s.exact_match
  from scored s
  order by s.at_company desc, s.exact_match desc, s.meeting_count desc, s.canonical_name
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- ── 5. Unlinked items that NAME this person ───────────────────────────────
--
-- The honest-state guard for /people/[id]. Without it, a person page showing
-- 7 items reads as a complete account of what they owe while more are
-- floating as free text. Done in SQL because doing it in JS would mean
-- fetching a LIMITed slice of unlinked items and filtering after — a match
-- past the slice would silently vanish and the page would UNDER-report the
-- gap, which is the exact failure the banner exists to prevent.
--
-- total_count is a window count over the full match set, so the number shown
-- is right even when the sample rows are capped.

create or replace function unlinked_owner_matches(
  p_entity_id uuid,
  p_limit integer default 25
)
returns table (
  id uuid,
  description text,
  owner_name text,
  due_date date,
  meeting_id uuid,
  company_name text,
  item_status text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select e.canonical_name, coalesce(e.aliases, '[]'::jsonb) as aliases
    from entities e
    where e.id = p_entity_id and e.kind = 'person'
  ),
  target_names as (
    select t.canonical_name as nm from target t
    union all
    select al.value from target t, jsonb_array_elements_text(t.aliases) as al(value)
  ),
  target_tokens as (
    select coalesce(array_agg(distinct tok), '{}'::text[]) as tokens
    from target_names tn
    cross join lateral unnest(person_name_tokens(tn.nm)) as tok
  ),
  matches as (
    select
      ai.id, ai.description, ai.owner_name, ai.due_date,
      ai.meeting_id, m.company_name, ai.item_status
    from action_items ai
    join meetings m on m.id = ai.meeting_id
    cross join target_tokens tt
    where ai.owner_entity_id is null
      and ai.owner_name is not null
      and length(trim(ai.owner_name)) > 0
      and coalesce(array_length(tt.tokens, 1), 0) > 0
      and person_name_tokens(ai.owner_name) && tt.tokens
  )
  select
    mt.id, mt.description, mt.owner_name, mt.due_date,
    mt.meeting_id, mt.company_name, mt.item_status,
    count(*) over () as total_count
  from matches mt
  order by (mt.item_status = 'open') desc, mt.due_date asc nulls last, mt.id
  limit least(greatest(coalesce(p_limit, 25), 1), 200);
$$;

-- ── 6. Grants ─────────────────────────────────────────────────────────────
-- Both are signed-in surfaces; /review/[token] has no business enumerating
-- people or action items.

revoke all on function person_name_tokens(text) from public, anon;
grant execute on function person_name_tokens(text) to authenticated;

revoke all on function search_owner_candidates(text, uuid, integer) from public, anon;
grant execute on function search_owner_candidates(text, uuid, integer) to authenticated;

revoke all on function unlinked_owner_matches(uuid, integer) from public, anon;
grant execute on function unlinked_owner_matches(uuid, integer) to authenticated;
