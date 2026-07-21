-- 0032 — make the anonymous confirmation path organisation-aware.
--
-- 0031 dropped the zero-argument gs_active_workspace() and 0029 made
-- confirmations.org_id NOT NULL. This function called the former and did not
-- populate the latter, so between those migrations and this one an outside
-- director confirming minutes would have hit a NOT NULL violation. That is the
-- single most important write in the product — an externally decided moment
-- that cannot be reconstructed if lost.
--
-- The organisation is derived from the MEETING, never from the caller: the
-- caller here is anonymous by design, holds no session and belongs to no
-- organisation. The share token is the credential; the meeting decides the
-- tenant.

create or replace function public.confirm_shared_draft(share_token text, p_name text, p_role text)
returns table(confirmed_at timestamp with time zone)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_share review_shares%rowtype;
  v_count integer;
  v_company_id uuid;
  v_org_id uuid;
  v_workspace text;
  v_confirmations integer;
  v_confirmed_at timestamptz;
begin
  select * into v_share from review_shares
  where token = share_token and expires_at > now();
  if not found then
    raise exception 'invalid or expired share token';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'name required';
  end if;
  if length(trim(p_name)) > 120 or length(coalesce(p_role,'')) > 120 then
    raise exception 'name or role too long';
  end if;

  -- Tenant and company come from the meeting, not the caller.
  select m.company_id, m.org_id into v_company_id, v_org_id
  from meetings m where m.id = v_share.meeting_id;

  if v_org_id is null then
    raise exception 'meeting has no organisation';
  end if;

  -- idempotent per (share, name)
  if exists (select 1 from confirmations c where c.share_id = v_share.id and lower(c.confirmed_name) = lower(trim(p_name))) then
    return query select c.confirmed_at from confirmations c
      where c.share_id = v_share.id and lower(c.confirmed_name) = lower(trim(p_name)) limit 1;
    return;
  end if;

  -- hard cap: a board/committee has far fewer than 50 confirmers
  select count(*) into v_count from confirmations c where c.share_id = v_share.id;
  if v_count >= 50 then
    raise exception 'confirmation limit reached for this link';
  end if;

  insert into confirmations (share_id, draft_id, meeting_id, confirmed_name, confirmed_role, org_id)
  values (v_share.id, v_share.draft_id, v_share.meeting_id, trim(p_name),
          nullif(trim(coalesce(p_role,'')), ''), v_org_id)
  returning confirmations.confirmed_at into v_confirmed_at;

  -- GroundStream enqueue, same transaction
  select count(*) into v_confirmations from confirmations c where c.draft_id = v_share.draft_id;
  v_workspace := public.gs_active_workspace(v_org_id);

  -- No configured workspace for THIS organisation, or no company on the
  -- meeting, means NO event rather than a guessed one. With two firms
  -- connected, a guess would file one firm's confirmations into the other's
  -- workspace, and there is no undo for that.
  if v_company_id is not null and v_workspace is not null then
    insert into public.gs_outbox
      (entity, aa_stage, event_name, actor_id, external_event_id, occurred_at, payload)
    values
      (v_workspace, 'activated', 'minutes_confirmed_by_recipient',
       v_company_id::text,
       'draft-' || v_share.draft_id::text || '-confirmed',
       v_confirmed_at,
       jsonb_build_object(
         'meeting_id', v_share.meeting_id,
         'draft_id', v_share.draft_id,
         'confirmation_count', v_confirmations
       ))
    on conflict (entity, external_event_id) do nothing;
  end if;

  return query select v_confirmed_at;
end;
$function$;
