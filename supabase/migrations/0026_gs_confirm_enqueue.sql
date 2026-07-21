-- 0026 — enqueue the confirmation event INSIDE the SECURITY DEFINER function.
--
-- /gs §1.3: an event triggered by an anonymous caller must not enqueue through
-- the request-scoped client. `confirm_shared_draft` is called from
-- /review/[token] with NO session — the token is the credential — so there is
-- no server-side hop that could hold the service-role key, and an enqueue
-- attempted from the caller's context would be refused by the outbox's
-- deny-all RLS. Silently: supabase-js resolves the error rather than throwing.
--
-- Enqueuing here also makes it ATOMIC: the confirmation row and the event
-- commit together or not at all. That matters more here than anywhere else in
-- this app — a director attesting minutes are accurate is the one externally
-- decided moment in the product, and losing it would understate precisely the
-- signal worth measuring.
--
-- ACTOR is the client company, consistent with the rest of the map: it is that
-- company's record that has been externally confirmed. The confirmer is NOT
-- used as an identity hint — an outside director never signed up anywhere, and
-- minting an identity for them would create a person in GroundStream who does
-- not exist there.

create or replace function public.confirm_shared_draft(share_token text, p_name text, p_role text)
returns table(confirmed_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_share review_shares%rowtype;
  v_count integer;
  v_company_id uuid;
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

  insert into confirmations (share_id, draft_id, meeting_id, confirmed_name, confirmed_role)
  values (v_share.id, v_share.draft_id, v_share.meeting_id, trim(p_name), nullif(trim(coalesce(p_role,'')), ''))
  returning confirmations.confirmed_at into v_confirmed_at;

  -- ── GroundStream enqueue, same transaction ───────────────────────────────
  select m.company_id into v_company_id from meetings m where m.id = v_share.meeting_id;
  select count(*) into v_confirmations from confirmations c where c.draft_id = v_share.draft_id;
  v_workspace := public.gs_active_workspace();

  -- No configured workspace, or no company on the meeting, means NO event
  -- rather than a guessed one. A telemetry gap is recoverable; an event filed
  -- against the wrong workspace is not.
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
