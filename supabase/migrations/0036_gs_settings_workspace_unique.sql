-- 0036 — restore uniqueness on gs_settings.workspace.
--
-- 0031 replaced the UNIQUE on `workspace` with one on `org_id`, which is the
-- right primary rule (one credential per organisation). But resolveCredential()
-- still looks the row up BY WORKSPACE and calls .maybeSingle(), so without this
-- index a duplicate workspace value would make that call error out.
--
-- It fails closed rather than leaking — maybeSingle() errors on multiple rows
-- instead of picking one — but "the integration stops working for reasons no one
-- can see" is not an acceptable resting state.

create unique index if not exists gs_settings_workspace_uniq on public.gs_settings(workspace);
