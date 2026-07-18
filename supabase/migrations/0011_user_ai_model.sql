-- Per-user AI model choice, changed in-app (Settings page) — no Vercel env edit.
alter table profiles add column if not exists ai_model text;

create or replace function set_my_ai_model(p_model text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_model is not null and length(p_model) > 120 then raise exception 'model id too long'; end if;
  update profiles set ai_model = nullif(trim(coalesce(p_model,'')), '') where id = v_uid;
  return (select ai_model from profiles where id = v_uid);
end; $$;
revoke execute on function set_my_ai_model(text) from public, anon;
grant execute on function set_my_ai_model(text) to authenticated;
