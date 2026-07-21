-- 0028 — the first organisation, seeded from existing data.
--
-- Everything in this database today belongs to one real firm, so it becomes
-- org #1. The prior APP-WIDE admin becomes its owner; the QA cosec and reviewer
-- accounts become plain members, because they were never admins and the point
-- of this work is that "admin" stops meaning "admin of everything".

insert into public.organisations (name, slug, created_by)
select 'Drive Funnels', 'drive-funnels', p.id
from public.profiles p where p.role = 'admin'
order by p.id limit 1
on conflict (slug) do nothing;

insert into public.organisation_members (org_id, user_id, role)
select o.id, p.id, case when p.role = 'admin' then 'owner' else 'member' end
from public.profiles p
cross join public.organisations o
where o.slug = 'drive-funnels'
on conflict (org_id, user_id) do nothing;
