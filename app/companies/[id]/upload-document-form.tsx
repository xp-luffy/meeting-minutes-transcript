"use client";

import { useActionState, useId, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FOCUS_RING } from "@/components/ui";
import {
  ACCEPT_ATTRIBUTE,
  DOC_TYPE_SLOTS,
  MAX_TITLE_LENGTH,
  MAX_UPLOAD_BYTES,
  formatFileSize,
  type DocType,
} from "@/lib/company-documents-types";
import { uploadCompanyDocument, type UploadState } from "./documents-actions";

const INPUT_CLASS =
  "block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400";

const LABEL_CLASS = "block text-xs font-semibold tracking-wide text-neutral-500 uppercase";

/**
 * Upload / replace form for the company document cabinet.
 *
 * Notes on what this component deliberately does NOT do:
 *
 * - It never guesses the document type from the filename. An auto-classified
 *   document is an unverified claim wearing a verified costume
 *   (DESIGN_SPEC_V4 §2.6 / §6), and the type it guessed would go on to back a
 *   quorum check nobody confirmed.
 * - Its size/type checks are a courtesy that saves a wasted upload. They are
 *   NOT the control — `uploadCompanyDocument` re-checks size, MIME and the
 *   file's magic bytes server-side, because client validation is advisory.
 * - The submit button reflects real pending state via `useFormStatus`
 *   (SubmitButton). This project shipped a silent Create Meeting button once
 *   and a user made eight duplicates (docs/PILOT_PLAYBOOK.md #13).
 */
export function UploadDocumentForm({
  companyId,
  slotsInForce,
}: {
  companyId: string;
  /** Doc types that already hold an in-force document, so we can warn about supersession. */
  slotsInForce: Partial<Record<DocType, { title: string; inForceFrom: string }>>;
}) {
  const [state, formAction] = useActionState<UploadState, FormData>(uploadCompanyDocument, {});
  const [docType, setDocType] = useState<DocType | "">("");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const formId = useId();
  const selectedSlot = DOC_TYPE_SLOTS.find((s) => s.type === docType);
  const replacing = docType ? slotsInForce[docType as DocType] : undefined;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setClientError(null);
    if (!file) {
      setFileNote(null);
      return;
    }
    setFileNote(`${file.name} · ${formatFileSize(file.size)}`);
    if (file.size > MAX_UPLOAD_BYTES) {
      setClientError(
        `That file is ${formatFileSize(file.size)} — the limit is ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
      );
    }
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex min-h-11 items-center justify-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:min-h-0 sm:py-1.5 ${FOCUS_RING}`}
        >
          Upload document
        </button>
        {state.success ? (
          <p className="mt-2 text-xs text-emerald-700" role="status">
            {state.success}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
      aria-labelledby={`${formId}-heading`}
    >
      <h3 id={`${formId}-heading`} className="text-sm font-semibold text-neutral-900">
        Upload a document
      </h3>
      <p className="mt-1 text-xs text-neutral-500">
        PDF or DOCX, up to {formatFileSize(MAX_UPLOAD_BYTES)}. Nothing here is ever deleted —
        replacing a document marks the old one superseded and keeps it on file.
      </p>

      <input type="hidden" name="company_id" value={companyId} />

      <div className="mt-4 space-y-4">
        <div>
          <label className={LABEL_CLASS} htmlFor={`${formId}-type`}>
            Document type
          </label>
          <select
            id={`${formId}-type`}
            name="doc_type"
            required
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType | "")}
            className={`mt-1 ${INPUT_CLASS} ${FOCUS_RING}`}
          >
            <option value="">Choose a type…</option>
            {DOC_TYPE_SLOTS.map((slot) => (
              <option key={slot.type} value={slot.type}>
                {slot.label}
              </option>
            ))}
          </select>
          {selectedSlot ? (
            <p className="mt-1 text-xs text-neutral-500">Backs: {selectedSlot.backs}</p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">
              We never guess the type from the filename — a document filed as the wrong type would
              back the wrong check.
            </p>
          )}
        </div>

        {replacing ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span aria-hidden>! </span>
            <span className="font-medium">{replacing.title}</span> is currently in force (since{" "}
            {replacing.inForceFrom}). It will be marked superseded from the new document&apos;s
            effective date. It stays on file and remains the authority for minutes finalised before
            that date.
          </p>
        ) : null}

        <div>
          <label className={LABEL_CLASS} htmlFor={`${formId}-title`}>
            Title
          </label>
          <input
            id={`${formId}-title`}
            name="title"
            type="text"
            required
            maxLength={MAX_TITLE_LENGTH}
            placeholder="e.g. Constitution as amended by SR-2025-01"
            className={`mt-1 ${INPUT_CLASS} ${FOCUS_RING}`}
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor={`${formId}-date`}>
            Effective from
          </label>
          <input
            id={`${formId}-date`}
            name="in_force_from"
            type="date"
            className={`mt-1 ${INPUT_CLASS} ${FOCUS_RING}`}
            aria-describedby={`${formId}-date-help`}
          />
          <p id={`${formId}-date-help`} className="mt-1 text-xs text-neutral-500">
            The date this version took effect — usually the date it was adopted, not the date you
            received it. <span className="text-amber-700">Leave blank if you do not know:</span> the
            document will be filed, but with no effective date it cannot be used to verify any
            check.
          </p>
        </div>

        {docType === "constitution" ? (
          <fieldset className="rounded-md border border-neutral-200 p-3">
            <legend className="px-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              Quorum, as stated in this document
            </legend>
            <p className="text-xs text-neutral-500">
              Optional. The app does not read the file&apos;s contents, so a quorum threshold is
              only ever known because a person read it off this document. Leave blank if you are not
              sure — an unknown threshold is reported as{" "}
              <span className="font-medium">not verified</span>, which is honest. A guess would be
              worse than nothing.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <div>
                <label className={LABEL_CLASS} htmlFor={`${formId}-quorum`}>
                  Quorum is
                </label>
                <input
                  id={`${formId}-quorum`}
                  name="quorum_threshold"
                  type="number"
                  min={1}
                  max={1000}
                  className={`mt-1 w-28 ${INPUT_CLASS} ${FOCUS_RING}`}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor={`${formId}-quorum-total`}>
                  out of
                </label>
                <input
                  id={`${formId}-quorum-total`}
                  name="quorum_total"
                  type="number"
                  min={1}
                  max={1000}
                  className={`mt-1 w-28 ${INPUT_CLASS} ${FOCUS_RING}`}
                />
              </div>
            </div>
          </fieldset>
        ) : null}

        <div>
          <label className={LABEL_CLASS} htmlFor={`${formId}-file`}>
            File
          </label>
          <input
            id={`${formId}-file`}
            name="file"
            type="file"
            required
            accept={ACCEPT_ATTRIBUTE}
            onChange={handleFileChange}
            className={`mt-1 block w-full text-sm text-neutral-700 file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:text-sm file:font-medium file:text-neutral-700 ${FOCUS_RING}`}
          />
          {fileNote ? <p className="mt-1 text-xs text-neutral-500">{fileNote}</p> : null}
        </div>
      </div>

      {clientError ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {clientError}
        </p>
      ) : null}
      {state.error ? (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-3 text-sm text-emerald-700" role="status">
          {state.success}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <SubmitButton pendingLabel="Uploading…">Upload document</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`inline-flex min-h-11 w-full items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:min-h-0 sm:w-auto sm:py-2 ${FOCUS_RING}`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
