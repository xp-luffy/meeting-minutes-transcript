-- 0044 — the client timeline. A VIEW, not a table.
--
-- The "compound" pillar: every decision, commitment and confirmation for one
-- company in one ordered stream. A view rather than a table because there is
-- nothing to store — it is a projection of records that already exist, so it
-- can never drift out of sync and adds no new write path to secure.
--
-- security_invoker = true is load-bearing (same pattern as 0013/0016): every
-- branch is filtered by the CALLER's own RLS on the base tables, including the
-- restrictive org_isolation. Without it the view runs as its owner and leaks
-- across tenants. INNER joins onto meetings mean a child whose meeting is hidden
-- by RLS drops out with it — the failure direction is closed.
--
-- Proven on apply: as postgres the view returned 40 rows (a planted rival org
-- included); as a member of another org, 0 rival rows and only their own 10.
--
-- No org_id, policy or index of its own: a view has no rows. It is exactly as
-- isolated as the tables beneath it, which is the point.

create or replace view public.client_timeline
with (security_invoker = true) as
  select
    'meeting'::text            as kind,
    m.id                       as record_id,
    m.company_id               as company_id,
    m.meeting_date::timestamptz as at,
    coalesce(m.meeting_type, 'Meeting') as title,
    null::text                 as detail,
    null::text                 as status,
    m.org_id                   as org_id
  from public.meetings m
  where m.company_id is not null

  union all
  select
    'decision', r.id, m.company_id, m.created_at,
    coalesce(nullif(r.resolution_number, ''), 'Decision'),
    left(r.resolution_text, 300),
    r.outcome,
    r.org_id
  from public.resolutions r
  join public.meetings m on m.id = r.meeting_id
  where m.company_id is not null

  union all
  select
    'commitment', a.id, m.company_id,
    coalesce(a.due_date::timestamptz, a.created_at),
    a.description,
    a.owner_name,
    a.item_status,
    a.org_id
  from public.action_items a
  join public.meetings m on m.id = a.meeting_id
  where m.company_id is not null

  union all
  select
    'confirmation', c.id, m.company_id, c.confirmed_at,
    c.confirmed_name,
    c.confirmed_role,
    'confirmed',
    c.org_id
  from public.confirmations c
  join public.meetings m on m.id = c.meeting_id
  where m.company_id is not null;
