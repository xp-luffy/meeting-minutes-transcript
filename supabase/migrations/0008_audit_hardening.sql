-- Defense-in-depth for V2 audit findings (docs/AUDIT_V2.md). App-layer fixes are
-- in app/meetings/[id]/draft/actions.ts, share-actions.ts, lib/sanitize-html.ts.

-- P1: review_shares/confirmations must bind a draft to ITS OWN meeting (blocks
-- IDOR where a leaked draft UUID is paired with an unrelated accessible meeting).
create or replace function review_share_draft_matches_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from minutes_drafts d where d.id = new.draft_id and d.meeting_id = new.meeting_id) then
    raise exception 'draft % does not belong to meeting %', new.draft_id, new.meeting_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_review_share_binding on review_shares;
create trigger trg_review_share_binding before insert on review_shares
  for each row execute function review_share_draft_matches_meeting();

create or replace function confirmation_draft_matches_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from minutes_drafts d where d.id = new.draft_id and d.meeting_id = new.meeting_id) then
    raise exception 'draft % does not belong to meeting %', new.draft_id, new.meeting_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_confirmation_binding on confirmations;
create trigger trg_confirmation_binding before insert on confirmations
  for each row execute function confirmation_draft_matches_meeting();

-- P2: companies_insert must not attach a company to a workspace the user isn't in.
drop policy if exists "companies_insert" on companies;
create policy "companies_insert" on companies for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      workspace_id is null
      or is_workspace_member(workspace_id)
      or exists (select 1 from workspaces w where w.id = workspace_id and w.created_by = (select auth.uid()))
    )
  );

-- P1 (Opus): cap confirmations per share (prevent unbounded attestation spam)
-- + length bounds. Confirming under an arbitrary name is a documented v1 limit
-- of link-based confirmation without per-recipient tokens.
create or replace function confirm_shared_draft(share_token text, p_name text, p_role text)
returns table (confirmed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_share review_shares%rowtype; v_count integer;
begin
  select * into v_share from review_shares where token = share_token and expires_at > now();
  if not found then raise exception 'invalid or expired share token'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'name required'; end if;
  if length(trim(p_name)) > 120 or length(coalesce(p_role,'')) > 120 then raise exception 'name or role too long'; end if;
  if exists (select 1 from confirmations c where c.share_id = v_share.id and lower(c.confirmed_name) = lower(trim(p_name))) then
    return query select c.confirmed_at from confirmations c
      where c.share_id = v_share.id and lower(c.confirmed_name) = lower(trim(p_name)) limit 1;
    return;
  end if;
  select count(*) into v_count from confirmations c where c.share_id = v_share.id;
  if v_count >= 50 then raise exception 'confirmation limit reached for this link'; end if;
  return query
  insert into confirmations (share_id, draft_id, meeting_id, confirmed_name, confirmed_role)
  values (v_share.id, v_share.draft_id, v_share.meeting_id, trim(p_name), nullif(trim(coalesce(p_role,'')), ''))
  returning confirmations.confirmed_at;
end; $$;
