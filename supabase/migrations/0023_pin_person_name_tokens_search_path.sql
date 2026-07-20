-- 0023 — Supabase advisor 0011: person_name_tokens (added in 0017) had a
-- mutable search_path. Every other function in this schema pins it; this one
-- was missed. Pinning removes the search_path-shadowing attack surface.
create or replace function person_name_tokens(p_name text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct t), '{}'::text[])
  from unnest(
    string_to_array(
      trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')),
      ' '
    )
  ) as t
  where length(t) >= 3
    and t not in (
      'bin','binti','bte','the','and','for','dato','datuk','datin',
      'encik','puan','tuan','haji','hajah','mrs','dr','prof'
    );
$$;
