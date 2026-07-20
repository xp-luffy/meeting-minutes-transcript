"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import {
  ACCEPTED_MIME_TYPES,
  DOCUMENT_BUCKET,
  DOCX_MIME,
  DOC_TYPE_SLOTS,
  MAX_TITLE_LENGTH,
  MAX_UPLOAD_BYTES,
  PDF_MIME,
  isDocType,
  parseIsoDate,
  sniffFileType,
  type DocType,
} from "@/lib/company-documents-types";

/**
 * Company document cabinet — write side.
 *
 * Every mutating action here follows the repo's write-path convention
 * (docs/PILOT_PLAYBOOK.md pattern A + E):
 *
 *   1. Require a session.
 *   2. RE-VERIFY OWNERSHIP with a filtered query and a 0-row guard, in the app,
 *      even though RLS also enforces it. Two independent layers; neither is
 *      trusted alone.
 *   3. Return the failure. Never `catch {}` and return success — a silent no-op
 *      on a governing document is the worst outcome in this product, because
 *      the user then believes the constitution is on file when it is not.
 *
 * Uploads are UNTRUSTED INPUT. Size, MIME and magic bytes are all checked
 * server-side; the client's `accept` attribute and size hint are courtesies,
 * not controls. The stored object key is generated here and never derived from
 * the user's filename.
 */

export interface UploadState {
  error?: string;
  success?: string;
}

export interface ActionResult {
  error?: string;
  success?: true;
}

/**
 * Strips control characters and collapses whitespace in untrusted text.
 *
 * Titles come from the user and are rendered on the company page. React
 * escapes them and nothing here ever reaches `dangerouslySetInnerHTML`, so
 * that escaping is the actual XSS control; this keeps the stored value tidy
 * and free of characters that would corrupt a later export.
 */
function cleanText(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Confirms the caller may act on this company, by explicit query rather than by
 * assuming RLS did it. `companies_read` (migration 0006) also admits
 * `user_id is null` rows; this guard is stricter and matches the
 * `can_access_company()` predicate the RLS policies in migration 0018 use, so
 * the app layer and the database agree on who owns what.
 */
async function assertCompanyAccess(
  companyId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select("id, user_id, workspace_id")
    .eq("id", companyId)
    .maybeSingle();

  if (error) return { ok: false, error: `Could not verify the company: ${error.message}` };
  if (!company) return { ok: false, error: "Company not found, or you do not have access to it." };

  if (company.user_id === userId) return { ok: true };

  if (company.workspace_id) {
    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", company.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) {
      return { ok: false, error: `Could not verify workspace access: ${membershipError.message}` };
    }
    if (membership) return { ok: true };
  }

  return { ok: false, error: "Company not found, or you do not have access to it." };
}

/**
 * Files a document into a company's cabinet, optionally superseding the
 * document currently in force in a single-in-force slot.
 *
 * Supersession, never deletion: the outgoing document keeps its row and its
 * file, and stays the correct authority for minutes finalised before the new
 * document's effective date.
 */
export async function uploadCompanyDocument(
  _prevState: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to upload a document." };

  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return { error: "Missing company." };

  const access = await assertCompanyAccess(companyId, user.id);
  if (!access.ok) return { error: access.error };

  // --- validate the typed metadata -----------------------------------------

  const docTypeRaw = String(formData.get("doc_type") ?? "");
  if (!isDocType(docTypeRaw)) {
    // No filename-based guessing, ever. An auto-classified document is an
    // unverified claim wearing a verified costume (DESIGN_SPEC_V4 §2.6).
    return { error: "Choose a document type." };
  }
  const docType: DocType = docTypeRaw;
  const slot = DOC_TYPE_SLOTS.find((s) => s.type === docType);
  if (!slot) return { error: "Choose a document type." };

  const title = cleanText(String(formData.get("title") ?? ""));
  if (!title) return { error: "Give the document a title." };
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Title is too long (max ${MAX_TITLE_LENGTH} characters).` };
  }

  const inForceRaw = String(formData.get("in_force_from") ?? "").trim();
  let inForceFrom: string | null = null;
  if (inForceRaw) {
    inForceFrom = parseIsoDate(inForceRaw);
    if (!inForceFrom) return { error: "Effective date must be a valid date (YYYY-MM-DD)." };
  }

  let quorumThreshold: number | null = null;
  let quorumTotal: number | null = null;
  if (docType === "constitution") {
    const thresholdRaw = String(formData.get("quorum_threshold") ?? "").trim();
    const totalRaw = String(formData.get("quorum_total") ?? "").trim();
    if (thresholdRaw) {
      const parsed = Number(thresholdRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
        return { error: "Quorum threshold must be a whole number of directors." };
      }
      quorumThreshold = parsed;
    }
    if (totalRaw) {
      const parsed = Number(totalRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
        return { error: "Quorum total must be a whole number of directors." };
      }
      quorumTotal = parsed;
    }
    if (quorumTotal !== null && quorumThreshold !== null && quorumThreshold > quorumTotal) {
      return { error: "Quorum threshold cannot exceed the total number of directors." };
    }
    if (quorumTotal !== null && quorumThreshold === null) {
      return { error: "Enter the quorum threshold as well as the total, or leave both blank." };
    }
  }

  // --- validate the file ----------------------------------------------------

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF or DOCX file to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `File is too large (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).` };
  }
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return { error: "Only PDF and DOCX files are accepted." };
  }

  const buffer = await file.arrayBuffer();
  // Re-check the real length: File.size is client-reported metadata.
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return { error: `File is too large (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).` };
  }
  const signature = sniffFileType(new Uint8Array(buffer.slice(0, 8)));
  if (file.type === PDF_MIME && signature !== "pdf") {
    return { error: "That file is not a valid PDF." };
  }
  if (file.type === DOCX_MIME && signature !== "zip") {
    return { error: "That file is not a valid DOCX." };
  }

  const supabase = await createClient();

  // --- supersession target (single-in-force slots only) ---------------------

  let supersedeId: string | null = null;
  if (slot.shape === "single") {
    const { data: currentRows, error: currentError } = await supabase
      .from("company_documents")
      .select("id, in_force_from, title")
      .eq("company_id", companyId)
      .eq("doc_type", docType)
      .is("superseded_by", null)
      .not("in_force_from", "is", null)
      .order("in_force_from", { ascending: false })
      .limit(1);

    if (currentError) {
      return { error: `Could not check the current document: ${currentError.message}` };
    }

    const current = currentRows?.[0];
    if (current) {
      if (!inForceFrom) {
        return {
          error:
            "This slot already holds a document in force. Give the new one an effective date so it can supersede it.",
        };
      }
      if (inForceFrom <= (current.in_force_from as string)) {
        return {
          error:
            "This document's effective date is on or before the current version's. Supersession must move forward in time.",
        };
      }
      supersedeId = current.id as string;
    }
  }

  // --- store the file -------------------------------------------------------

  // Key is server-generated. Never build it from file.name: the filename is
  // untrusted and would allow path traversal out of the company's prefix — the
  // prefix the storage policies authorize on.
  const extension = file.type === PDF_MIME ? "pdf" : "docx";
  const storagePath = `${companyId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  // --- record it ------------------------------------------------------------

  const { data: inserted, error: insertError } = await supabase
    .from("company_documents")
    .insert({
      company_id: companyId,
      doc_type: docType,
      title,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: buffer.byteLength,
      uploaded_by: user.id,
      in_force_from: inForceFrom,
      quorum_threshold: quorumThreshold,
      quorum_total: quorumTotal,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // The object is now stored but unreferenced. We do NOT delete it: the
    // bucket has no delete policy by design (nothing in this cabinet is ever
    // destroyed). An unreferenced private object is inert. Surfacing the
    // failure matters far more than tidying it away silently.
    return {
      error: `The file uploaded but could not be recorded: ${insertError?.message ?? "unknown error"}. Nothing has been added to the cabinet — please try again.`,
    };
  }

  const newId = inserted.id as string;

  // --- supersede the outgoing document --------------------------------------

  if (supersedeId) {
    const { data: superseded, error: supersedeError } = await supabase
      .from("company_documents")
      .update({ superseded_by: newId, superseded_at: inForceFrom })
      .eq("id", supersedeId)
      .eq("company_id", companyId) // bind BOTH sides on the write, not just the id
      .select("id");

    if (supersedeError || !superseded || superseded.length === 0) {
      // Honest partial failure: the new document IS filed, but two documents
      // now look current. Say exactly that rather than reporting success.
      return {
        error:
          "The document was filed, but the previous version could not be marked superseded. Two versions now show as in force — please retry, or contact support.",
      };
    }
  }

  await writeAuditLog(companyId, newId, "company_document_uploaded", {
    doc_type: docType,
    in_force_from: inForceFrom,
    superseded: supersedeId,
    file_size: buffer.byteLength,
  });

  revalidatePath(`/companies/${companyId}`);

  return {
    success: supersedeId
      ? "Document filed. The previous version is now marked superseded and stays on file."
      : "Document filed.",
  };
}

/**
 * Returns a short-lived signed URL for a document.
 *
 * Signed, never public: the bucket is private, and a public URL would make a
 * company's governing documents readable by anyone who ever saw the link.
 * Ownership is re-verified here even though storage RLS also checks it.
 */
export async function getDocumentDownloadUrl(
  documentId: string,
  companyId: string,
): Promise<{ url?: string; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to download this document." };

  const access = await assertCompanyAccess(companyId, user.id);
  if (!access.ok) return { error: access.error };

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("company_documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("company_id", companyId) // both sides
    .limit(1);

  if (error) return { error: `Could not find the document: ${error.message}` };
  if (!rows || rows.length === 0) return { error: "Document not found for this company." };

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(rows[0].storage_path as string, 60);

  if (signError || !signed?.signedUrl) {
    return { error: `Could not prepare the download: ${signError?.message ?? "unknown error"}` };
  }

  return { url: signed.signedUrl };
}

/**
 * Best-effort audit trail. Mirrors lib/audit.ts, but writes `meeting_id: null` —
 * a cabinet document belongs to a company, not a meeting, and lib/audit.ts's
 * signature requires a meeting id.
 */
async function writeAuditLog(
  companyId: string,
  documentId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("audit_logs").insert({
      meeting_id: null,
      entity_type: "company_document",
      entity_id: documentId,
      action,
      payload: { ...payload, company_id: companyId },
    });
    if (error) console.error("writeAuditLog: insert failed", error);
  } catch (err) {
    console.error("writeAuditLog: unexpected error", err);
  }
}
