-- Scale optimizations from the 1,000-firm simulation (docs/SIM_REPORT.md).

-- Precedents "other companies" tier: company_id <> X can't use the equality
-- index; recency index makes the ORDER BY created_at DESC LIMIT path fast.
create index if not exists idx_resolutions_created_at on resolutions (created_at desc);

-- Evaluate auth.uid() once per statement (initplan) instead of per row in
-- every RLS policy (44 policies rewritten mechanically; verified none left).
do $$
declare p record; new_qual text; new_check text; stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%')
  loop
    new_qual := replace(p.qual, 'auth.uid()', '(select auth.uid())');
    new_check := replace(p.with_check, 'auth.uid()', '(select auth.uid())');
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then stmt := stmt || format(' using (%s)', new_qual); end if;
    if p.with_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;
    execute stmt;
  end loop;
end $$;
