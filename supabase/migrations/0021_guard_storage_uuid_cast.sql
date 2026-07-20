-- 0021 — guard the uuid cast added in 0020.
--
-- Final-QC finding: `((storage.foldername(name))[1])::uuid` RAISES on any
-- object whose first path segment is not a UUID, rather than returning false.
-- Today `company-documents` is the only bucket and the bucket_id predicate is
-- cheap, so the planner will almost certainly evaluate it first — but
-- PERMISSIVE policies are OR-combined and predicate order is a planner
-- decision, not a guarantee. The day a second bucket exists, listing it could
-- error. A regex test now gates the cast so it can never be reached with a
-- non-UUID segment.
drop policy if exists "company_documents_object_read" on storage.objects;
create policy "company_documents_object_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_access_company(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "company_documents_object_insert" on storage.objects;
create policy "company_documents_object_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_access_company(((storage.foldername(name))[1])::uuid)
  );
