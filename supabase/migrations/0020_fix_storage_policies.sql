-- 0020 — company document UPLOADS were impossible. Found by clicking Upload.
--
-- The UI reported, honestly: "Upload failed: new row violates row-level
-- security policy". Isolating the two writes showed the company_documents row
-- inserted fine and storage.objects was refused — for the company's OWNER.
--
-- Cause: 0018's storage policies inlined a subquery against public.companies.
-- A policy body runs as the CALLING role, so companies' own RLS applies inside
-- it, and the row the predicate depends on is not necessarily visible there.
-- The table policies never hit this because they call can_access_company(),
-- which is SECURITY DEFINER and therefore evaluates the membership question
-- with a stable, privileged view.
--
-- Fix: the storage policies call the same helper. One definition of "may this
-- user touch this company" for both the row and the object, so the two can no
-- longer disagree — a disagreement here means either a broken upload (this
-- bug) or an orphaned object.
--
-- The path's first segment is the company id and stays load-bearing; it is
-- server-generated and never derived from the uploaded filename.

drop policy if exists "company_documents_object_read" on storage.objects;
create policy "company_documents_object_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'company-documents'
    and public.can_access_company(
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

drop policy if exists "company_documents_object_insert" on storage.objects;
create policy "company_documents_object_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and public.can_access_company(
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

-- Still no DELETE policy, on either the table or the bucket: supersede, never
-- delete. "What was in force on the meeting date" must stay answerable.
