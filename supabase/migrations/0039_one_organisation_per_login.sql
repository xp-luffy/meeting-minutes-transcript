-- 0039 — a login belongs to exactly ONE organisation.
--
-- A deliberate product decision (isolation over convenience): a person who works
-- for two firms has two logins. Enforced here rather than assumed, because the
-- failure mode of assuming it is silent and unrecoverable.
--
-- WHY IT MUST BE A CONSTRAINT. current_org_id() resolves "the caller's
-- organisation" as the earliest membership row, and it is the DEFAULT on org_id
-- across 17 tables. With two memberships that default keeps stamping the OLDER
-- organisation onto records the user believes they are creating in the newer
-- one. RLS still refuses cross-tenant reads — the restrictive policy holds — so
-- nothing leaks; the records simply file themselves under the wrong firm, which
-- is the kind of wrong only discovered much later.
--
-- With this index current_org_id() is correct BY CONSTRUCTION, and the
-- alternative — an active-organisation switcher with a validated cookie plus
-- org_id passed explicitly at every insert — is not needed.
--
-- Adding someone to a second organisation now fails LOUDLY here instead of
-- silently misfiling their work. Moving a person between firms is a delete then
-- an insert, which is the honest shape of that operation: their old firm's
-- records stay with the old firm.

create unique index if not exists organisation_members_one_org_per_user
  on public.organisation_members(user_id);

comment on index public.organisation_members_one_org_per_user is
  'One login = one organisation. Makes current_org_id() unambiguous; see migration 0039.';
