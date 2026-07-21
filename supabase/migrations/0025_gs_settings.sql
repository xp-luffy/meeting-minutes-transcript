-- 0025 — GroundStream connection settings, configured in-app.
--
-- /integrate §1. A screen where an admin pastes a key, with no developer and no
-- redeploy. Every rule below is a scar, not a preference.
--
-- ITS OWN TABLE. Deliberately NOT added to `profiles` or any existing settings
-- table: those are readable by any authenticated user, which is correct for a
-- model name and catastrophic for a tenant-wide write credential. Anyone
-- holding this key can forge any event into that workspace.
--
-- ENCRYPTED AT REST. `api_key_ciphertext` is AES-256-GCM from lib/crypto.ts,
-- never the raw key. The plaintext is never stored, never returned to the
-- browser, and never logged. `api_key_last4` exists purely so the UI can render
-- gs_live_••••4f2a without decrypting anything.
--
-- ADMIN-ONLY, ENFORCED HERE. The policies below check profiles.role = 'admin'.
-- Hiding the screen in the UI is not access control: without these, any
-- authenticated caller could read the ciphertext straight from PostgREST.
--
-- ROW SHAPE IS PER-WORKSPACE ALREADY. One row today, but keyed by workspace so
-- moving to a credential per customer later is an insert, not a migration —
-- /integrate §1 "one credential per customer, not per app".

create table if not exists public.gs_settings (
  id                 uuid primary key default gen_random_uuid(),
  -- Logical workspace this credential belongs to. One row per workspace.
  workspace          text not null unique,
  -- Must match the source registered in GroundStream CHARACTER-FOR-CHARACTER:
  -- the comparison is case-sensitive and, on an unbound key, written verbatim.
  source_name        text not null check (length(trim(source_name)) > 0),
  api_key_ciphertext text not null,
  -- Display only. Never enough to reconstruct the key.
  api_key_last4      text not null check (length(api_key_last4) <= 8),
  -- The visible disconnect control writes here. /integrate calls this the most
  -- commonly missing piece: without it a leaked key can only be killed by a
  -- developer with database access.
  enabled            boolean not null default true,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Audit trail. Records WHO and WHEN, NEVER the value.
create table if not exists public.gs_settings_audit (
  id         bigserial primary key,
  workspace  text not null,
  action     text not null check (action in ('set','rotate','disable','enable','remove')),
  actor_id   uuid references auth.users(id),
  detail     text,
  created_at timestamptz not null default now()
);

alter table public.gs_settings enable row level security;
alter table public.gs_settings_audit enable row level security;

-- Admin-only, checked against the profiles table rather than a claim the
-- client could shape.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "gs_settings_admin_read" on public.gs_settings;
create policy "gs_settings_admin_read" on public.gs_settings
  for select to authenticated using (public.is_admin());

drop policy if exists "gs_settings_admin_write" on public.gs_settings;
create policy "gs_settings_admin_write" on public.gs_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "gs_settings_admin_update" on public.gs_settings;
create policy "gs_settings_admin_update" on public.gs_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "gs_settings_admin_delete" on public.gs_settings;
create policy "gs_settings_admin_delete" on public.gs_settings
  for delete to authenticated using (public.is_admin());

drop policy if exists "gs_audit_admin_read" on public.gs_settings_audit;
create policy "gs_audit_admin_read" on public.gs_settings_audit
  for select to authenticated using (public.is_admin());

-- Audit rows are written by the server action through the service-role client,
-- so there is deliberately no INSERT policy: nothing holding a user JWT may
-- forge an audit entry.

/**
 * The workspace name for enqueueing from inside SQL.
 *
 * confirm_shared_draft (SECURITY DEFINER, anonymous caller) needs to know which
 * workspace to stamp on an outbox row, and it has no session and no env access.
 * Reading it from here keeps the anonymous path working without a GUC the app
 * would have to set on every connection.
 *
 * Returns NULL when nothing is configured or the connection is disabled, and
 * the caller then emits nothing — never a guessed workspace.
 */
create or replace function public.gs_active_workspace()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select workspace from gs_settings where enabled order by created_at limit 1;
$$;

revoke execute on function public.gs_active_workspace() from public, anon, authenticated;
