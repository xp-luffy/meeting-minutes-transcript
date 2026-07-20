-- 0013 — push company stat counting into Postgres.
--
-- /companies was the slowest page (2.36s warm). getCompanyStatsMap issued two
-- sequential round trips and pulled EVERY meeting row and EVERY open action
-- row across all companies over the wire, only to count them in JS. The counts
-- are all the page renders.
--
-- security_invoker = true so the caller's RLS still applies — the view grants
-- no visibility a user didn't already have.

create or replace view company_stats
with (security_invoker = true) as
select
  c.id                                                   as company_id,
  count(distinct m.id)                                   as meeting_count,
  max(m.meeting_date)                                    as last_meeting_date,
  count(ai.id) filter (where ai.item_status = 'open')    as open_action_count
from companies c
left join meetings m      on m.company_id = c.id
left join action_items ai on ai.meeting_id = m.id
group by c.id;

-- Supporting indexes for the joins above (no-ops if already present).
create index if not exists meetings_company_id_idx     on meetings (company_id);
create index if not exists action_items_meeting_id_idx on action_items (meeting_id);
create index if not exists action_items_status_idx     on action_items (item_status) where item_status = 'open';
