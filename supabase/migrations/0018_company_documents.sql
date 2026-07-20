-- Sprint 3: COMPANY DOCUMENT CABINET.
--
-- Why this table exists: the documents that define a company's RULES
-- (constitution, terms of reference, register of directors, signed prior
-- minutes, SSM filings) live outside this app. That absence caused a real bug
-- on 2026-07-20 — the engine had no idea what quorum a company requires, so it
-- ASSUMED one and wrote the assumption into a statutory document as fact.
--
-- The cabinet's job is to make checks TRUSTWORTHY, not to store PDFs. Two rules
-- are enforced structurally here rather than left to application code:
--
--   1. SUPERSEDE, NEVER DELETE. The auditor's question is "what was in force on
--      the meeting date". A delete destroys that answer, so there is deliberately
--      NO delete policy on this table (see the bottom of the RLS block).
--   2. WRITE-PATH AUTHORIZATION BINDS BOTH SIDES. A policy that checked only the
--      acting user would let a caller attach a document to ANOTHER TENANT'S
--      company — the same bug class as `entity_links_insert` in migration 0010
--      (docs/PILOT_PLAYBOOK.md pattern E). Every policy below binds the acting
--      user AND the company.

-- ---------------------------------------------------------------------------
-- Access helper
-- ---------------------------------------------------------------------------

-- Mirrors can_access_meeting() from migration 0004, but DELIBERATELY STRICTER:
-- `companies_read` (migration 0006) also admits `user_id is null` rows, which
-- were the legacy public/demo companies. Migration 0015 removed demo data, and
-- a NULL-owned company must never become a hole through which any authenticated
-- caller can read or write governing documents. So: owner or workspace member,
-- nothing else.
create or replace function can_access_company(cid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select cid is not null and exists (
    select 1 from companies c
    where c.id = cid
      and (c.user_id = (select auth.uid()) or is_workspace_member(c.workspace_id))
  );
$$;

revoke execute on function can_access_company(uuid) from public, anon;
grant execute on function can_access_company(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,

  -- enum-ish text (matches the repo's existing convention for status columns)
  doc_type text not null check (doc_type in (
    'constitution',
    'terms_of_reference',
    'register_of_directors',
    'signed_minutes',
    'ssm_filing',
    'other'
  )),

  title text not null check (length(trim(title)) between 1 and 200),

  -- Server-generated: '<company_id>/<uuid>.<ext>'. NEVER derived from the
  -- uploaded filename (path traversal / bucket-key collision). The leading
  -- segment is load-bearing — the storage policies below authorize on it.
  storage_path text not null unique,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),

  uploaded_by uuid not null default auth.uid() references auth.users(id),

  -- NULL = "effective date not recorded". Per DESIGN_SPEC_V4 §2.3 a document
  -- with an unknown effective date CANNOT back a check. It does not degrade a
  -- check to a fail — it degrades it to "not verified". Unknown is a third
  -- state and must look like one.
  in_force_from date,

  -- The quorum this company's constitution requires, as read from THIS
  -- document by the person who filed it. Nullable, and null is honest: the app
  -- does not extract text from PDFs, so a threshold is only ever known if a
  -- human recorded it against a named, dated document. There is deliberately
  -- no way to record a threshold with no document behind it — see
  -- lib/company-documents.ts.
  quorum_threshold integer check (quorum_threshold is null or quorum_threshold > 0),
  quorum_total integer check (quorum_total is null or quorum_total > 0),

  -- Self-reference: the document that replaced this one. Supersession is the
  -- ONLY way a document leaves force.
  superseded_by uuid references company_documents(id) on delete set null,
  superseded_at date,

  created_at timestamptz not null default now(),

  constraint company_documents_no_self_supersede
    check (superseded_by is null or superseded_by <> id)
);

create index if not exists idx_company_documents_company
  on company_documents(company_id, doc_type, in_force_from desc);
create index if not exists idx_company_documents_superseded_by
  on company_documents(superseded_by);
create index if not exists idx_company_documents_uploader
  on company_documents(uploaded_by);

-- Confirms a supersession target belongs to the same company as the incoming
-- document. This MUST be a security-definer function rather than an inline
-- subquery in the policy: a policy on `company_documents` that itself selects
-- from `company_documents` makes Postgres re-enter the same policy and raise
-- "infinite recursion detected in policy for relation", which would break every
-- insert. No typecheck or `next build` can see that failure — it only appears
-- against a real database.
create or replace function company_document_in_company(doc_id uuid, cid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select doc_id is null or exists (
    select 1 from company_documents d where d.id = doc_id and d.company_id = cid
  );
$$;

revoke execute on function company_document_in_company(uuid, uuid) from public, anon;
grant execute on function company_document_in_company(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table company_documents enable row level security;

-- READ: bound to the company. A caller who is neither the company's owner nor
-- a member of its workspace sees zero rows.
drop policy if exists "company_documents_read" on company_documents;
create policy "company_documents_read" on company_documents for select to authenticated
  using (can_access_company(company_id));

-- INSERT: binds BOTH sides. `uploaded_by = auth.uid()` alone would be the
-- migration-0010 bug — it authenticates the actor but authorizes nothing about
-- the target, so any signed-in user could file a forged "constitution" against
-- a competitor's company and poison every quorum check made against it.
drop policy if exists "company_documents_insert" on company_documents;
create policy "company_documents_insert" on company_documents for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and can_access_company(company_id)
    -- A new row may only point its superseded_by at a document in the SAME
    -- company, so supersession can never reach across tenants.
    and company_document_in_company(superseded_by, company_id)
  );

-- UPDATE: this is the supersede path (stamping superseded_by / superseded_at on
-- the outgoing document). `using` stops you touching another tenant's row;
-- `with check` stops you MOVING a row into or out of a company you can access —
-- without it, an accessible row could be re-pointed at a victim's company_id.
drop policy if exists "company_documents_update" on company_documents;
create policy "company_documents_update" on company_documents for update to authenticated
  using (can_access_company(company_id))
  with check (
    can_access_company(company_id)
    and company_document_in_company(superseded_by, company_id)
  );

-- DELETE: intentionally NO policy. RLS denies by default, so deletes fail for
-- every caller including the owner. "What was in force on the meeting date" is
-- the question this cabinet exists to answer; a delete destroys the answer.
-- Documents leave force by supersession only.

-- ---------------------------------------------------------------------------
-- Storage: private bucket + policies that match the table's RLS
-- ---------------------------------------------------------------------------

-- Private (public = false). Downloads are served via short-lived SIGNED URLs
-- only — a public bucket would make every governing document world-readable to
-- anyone who ever saw a path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-documents',
  'company-documents',
  false,
  26214400, -- 25 MB, matches MAX_UPLOAD_BYTES in lib/company-documents-types.ts
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object keys are '<company_id>/<uuid>.<ext>'. `(storage.foldername(name))[1]`
-- is therefore the company id, and every policy authorizes on it — the object
-- path is bound to the same company the table row is bound to, so the two
-- cannot disagree.
drop policy if exists "company_documents_object_read" on storage.objects;
create policy "company_documents_object_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'company-documents'
    and exists (
      select 1 from public.companies c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_id = (select auth.uid()) or public.is_workspace_member(c.workspace_id))
    )
  );

drop policy if exists "company_documents_object_insert" on storage.objects;
create policy "company_documents_object_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    -- The acting user is bound by `to authenticated` plus the auth.uid() test
    -- inside the exists() below. We deliberately do NOT also test
    -- storage.objects.owner_id: that column's name/type has changed across
    -- Supabase storage versions, and a policy that fails to CREATE would abort
    -- this whole migration for no security gain.
    and exists (
      select 1 from public.companies c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_id = (select auth.uid()) or public.is_workspace_member(c.workspace_id))
    )
  );

-- No UPDATE and no DELETE policy on storage.objects for this bucket: a stored
-- file is immutable once written, for the same reason the table has no delete.
-- Replacing a document uploads a NEW object and supersedes the old row.
