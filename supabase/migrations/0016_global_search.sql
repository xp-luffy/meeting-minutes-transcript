-- 0016 — global full-text search.
--
-- Capture was strong and retrieval was missing: minutes, resolutions, action
-- items, obligations, companies and people all existed, but the only way to
-- reach any of them was to browse by company or by person. This adds one
-- search surface over all six.
--
-- Shape, in three layers:
--   1. a stored generated tsvector per source table, so the GIN index sits on
--      a real table column and the planner can actually use it (an index on a
--      view is not a thing);
--   2. `search_index`, a view that unions the six sources into one row shape;
--   3. `search_everything()`, which ranks with ts_rank and cuts the snippet
--      with ts_headline — neither of which PostgREST can express as a filter.
--
-- Tenancy. The view is `security_invoker = true` (the 0013 pattern) and the
-- function is SECURITY INVOKER — never DEFINER — so every branch of the union
-- is filtered by the caller's own RLS policies on the base tables (0003/0004/
-- 0006/0009, as amended by 0014/0015). Search grants no visibility a user did
-- not already have, and there is deliberately no privileged path around RLS
-- here (contrast `get_shared_draft`, which is DEFINER because the token IS the
-- credential). The joins onto `meetings` are INNER joins, so a child row whose
-- meeting is hidden drops out with it — the failure direction is closed.
--
-- Bounding. `search_everything` filters on `document @@ query` and only then
-- applies a clamped LIMIT: the limit trims a set that is already the set of
-- matches, rather than slicing an unfiltered table (the failure mode of the
-- old `detectConflicts` limit(200) — see docs/PILOT_PLAYBOOK.md #7 / pattern D).

-- ── 1. Generated tsvector columns ─────────────────────────────────────────
--
-- Every expression here must be IMMUTABLE for a stored generated column:
-- to_tsvector with an explicit regconfig, regexp_replace, left, coalesce and
-- setweight all qualify (unaccent notably does not, so it is not used).
--
-- `left(…, 100000)` is a safety valve, not a product decision: a tsvector is
-- capped at 1MB and exceeding it raises, which — in a generated column —
-- would turn into a failed INSERT on the draft itself. Real minutes are
-- orders of magnitude below this.
--
-- Weights bias ranking toward names and headings (ts_rank's default weights
-- are {D,C,B,A} = {0.1, 0.2, 0.4, 1.0}), so a company or person whose name
-- matches outranks a passing mention buried in a minutes body.

alter table companies
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', left(coalesce(name, ''), 100000)), 'A')
  ) stored;

alter table entities
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', left(coalesce(canonical_name, ''), 100000)), 'A')
  ) stored;

alter table obligations
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', left(coalesce(title, ''), 100000)), 'A')
  ) stored;

alter table resolutions
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', left(coalesce(resolution_text, ''), 100000)), 'B')
  ) stored;

alter table action_items
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', left(coalesce(description, ''), 100000)), 'B')
  ) stored;

-- Drafts are stored as HTML, so tags and entities are stripped before
-- tokenising — otherwise every draft matches "strong", "br" and "nbsp".
-- The identical expression appears in the view below as the snippet source;
-- the two must stay in step (a shared function would have to be pinned
-- IMMUTABLE and would then be undroppable while the column depends on it).
alter table minutes_drafts
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(
      to_tsvector('english',
        left(
          regexp_replace(
            regexp_replace(coalesce(body_html, ''), '<[^>]*>', ' ', 'g'),
            '&[#a-zA-Z0-9]+;', ' ', 'g'),
          100000)),
      'C')
  ) stored;

create index if not exists companies_search_idx      on companies      using gin (search_tsv);
create index if not exists entities_search_idx       on entities       using gin (search_tsv);
create index if not exists obligations_search_idx    on obligations    using gin (search_tsv);
create index if not exists resolutions_search_idx    on resolutions    using gin (search_tsv);
create index if not exists action_items_search_idx   on action_items   using gin (search_tsv);
create index if not exists minutes_drafts_search_idx on minutes_drafts using gin (search_tsv);

-- ── 2. The union view ─────────────────────────────────────────────────────
--
-- `title` is the label a result carries; `body` is the text the snippet is
-- cut from and is always the same text the row's `document` was built from,
-- so a row that matched always has something to highlight.
--
-- Only `kind = 'person'` entities are indexed. Org entities are graph nodes
-- mirroring `companies` rows (0009 backfilled them FROM companies), so
-- including them would surface every company twice under two headings.

create or replace view search_index
with (security_invoker = true) as

select
  'minutes'::text                                  as kind,
  d.id                                             as id,
  coalesce(m.meeting_type, 'Meeting')              as title,
  regexp_replace(
    regexp_replace(coalesce(d.body_html, ''), '<[^>]*>', ' ', 'g'),
    '&[#a-zA-Z0-9]+;', ' ', 'g')                   as body,
  m.company_id                                     as company_id,
  m.company_name                                   as company_name,
  d.meeting_id                                     as meeting_id,
  m.meeting_date                                   as occurred_at,
  d.search_tsv                                     as document
from minutes_drafts d
join meetings m on m.id = d.meeting_id

union all

select
  'resolution',
  r.id,
  coalesce(r.resolution_number, 'Resolution'),
  r.resolution_text,
  m.company_id,
  m.company_name,
  r.meeting_id,
  m.meeting_date,
  r.search_tsv
from resolutions r
join meetings m on m.id = r.meeting_id

union all

select
  'action_item',
  a.id,
  a.description,
  a.description,
  m.company_id,
  m.company_name,
  a.meeting_id,
  m.meeting_date,
  a.search_tsv
from action_items a
join meetings m on m.id = a.meeting_id

union all

select
  'obligation',
  o.id,
  o.title,
  coalesce(o.detail, o.title),
  m.company_id,
  m.company_name,
  o.meeting_id,
  m.meeting_date,
  o.search_tsv
from obligations o
join meetings m on m.id = o.meeting_id

union all

select
  'company',
  c.id,
  c.name,
  c.name,
  c.id,
  c.name,
  null::uuid,
  c.created_at::date,
  c.search_tsv
from companies c

union all

select
  'person',
  e.id,
  e.canonical_name,
  e.canonical_name,
  null::uuid,
  null::text,
  null::uuid,
  e.created_at::date,
  e.search_tsv
from entities e
where e.kind = 'person';

-- ── 3. The ranked search entry point ──────────────────────────────────────
--
-- websearch_to_tsquery (not to_tsquery) is what makes hostile input safe to
-- pass straight through: quotes, %, apostrophes (O'Brien), stray operators
-- and empty strings all parse to a well-formed query instead of raising.
-- An empty or stopword-only query yields numnode = 0 and returns nothing.
--
-- The snippet comes back as plain text with `[[[`/`]]]` around each match:
-- deliberately NOT HTML, so the caller can highlight by splitting the string
-- into React nodes and never has to render untrusted markup (the stored-XSS
-- lesson from the homegrown sanitizer — PILOT_PLAYBOOK #9).

create or replace function search_everything(q text, max_results integer default 40)
returns table (
  kind text,
  id uuid,
  title text,
  snippet text,
  company_id uuid,
  company_name text,
  meeting_id uuid,
  occurred_at date,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  with tsq as (
    select websearch_to_tsquery('english', coalesce(q, '')) as query
  )
  select
    s.kind,
    s.id,
    s.title,
    ts_headline('english', s.body, tsq.query,
      'StartSel="[[[",StopSel="]]]",MaxWords=34,MinWords=14,ShortWord=3,HighlightAll=FALSE'),
    s.company_id,
    s.company_name,
    s.meeting_id,
    s.occurred_at,
    ts_rank(s.document, tsq.query)
  from search_index s, tsq
  where numnode(tsq.query) > 0
    and s.document @@ tsq.query
  order by ts_rank(s.document, tsq.query) desc, s.occurred_at desc nulls last, s.id
  limit least(greatest(coalesce(max_results, 40), 1), 200);
$$;

-- Search is a signed-in surface only: /review/[token] is the sole anonymous
-- route and it has no business enumerating anything.
revoke all on function search_everything(text, integer) from public, anon;
grant execute on function search_everything(text, integer) to authenticated;

revoke all on search_index from anon;
grant select on search_index to authenticated;
