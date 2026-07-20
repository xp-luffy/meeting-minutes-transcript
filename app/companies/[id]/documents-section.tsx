import { Badge, EmptyState, EvidenceChip } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  buildUnlocksPanel,
  documentState,
  getCompanyDocuments,
  getQuorumThresholdReason,
  groupIntoSlots,
  type CabinetSlot,
  type CompanyDocument,
  type DerivedFact,
} from "@/lib/company-documents";
import { DOC_TYPE_LABEL, formatFileSize, type DocType } from "@/lib/company-documents-types";
import { DownloadDocumentButton } from "./download-document-button";
import { UploadDocumentForm } from "./upload-document-form";

/**
 * The company document cabinet, rendered on the company detail page.
 *
 * It is a CHECKLIST OF TYPED SLOTS, not a folder (DESIGN_SPEC_V4 §2.1). Empty
 * slots render, loudly, because the whole point is that a company with no
 * constitution on file must not look like a company that simply has a tidy
 * empty folder.
 *
 * Every title and filename below is rendered as TEXT. Nothing in this file uses
 * `dangerouslySetInnerHTML` — uploads are untrusted input and a document title
 * is attacker-controlled.
 */

/** Document state badge — glyph AND word AND colour, never colour alone. */
function DocumentStateBadge({ doc }: { doc: CompanyDocument }) {
  const state = documentState(doc);
  if (state === "in_force") {
    return (
      <Badge variant="green">
        <span aria-hidden>✓</span> In force since {formatDate(doc.in_force_from)}
      </Badge>
    );
  }
  if (state === "superseded") {
    return <Badge variant="neutral">Superseded {formatDate(doc.superseded_at)}</Badge>;
  }
  return (
    <Badge variant="amber">
      <span aria-hidden>!</span> Effective date not recorded
    </Badge>
  );
}

function DocumentRow({ doc, companyId }: { doc: CompanyDocument; companyId: string }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium break-words text-neutral-900">{doc.title}</p>
          <DocumentStateBadge doc={doc} />
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {DOC_TYPE_LABEL[doc.doc_type]} · {formatFileSize(doc.file_size)} · filed{" "}
          {formatDate(doc.created_at)}
        </p>
        {documentState(doc) === "undated" ? (
          <p className="mt-1 text-xs text-amber-700">
            Without an effective date this document cannot be used to verify any check.
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        <DownloadDocumentButton documentId={doc.id} companyId={companyId} title={doc.title} />
      </div>
    </li>
  );
}

/** A single-in-force slot: the current document, or a visibly empty slot. */
function SingleSlot({ slot, companyId }: { slot: CabinetSlot; companyId: string }) {
  const { current, history, undated } = slot;

  return (
    <section className="border-b border-neutral-200 px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/*
          The badge must state the TRUE state of the slot. "Not on file" when
          documents are in fact on file (but undated, or all superseded) would
          be a false statement of fact — the exact class of error this cabinet
          exists to eliminate. Three distinct empty-ish states, three messages.
        */}
        <h3 className="text-sm font-medium text-neutral-900">
          {slot.slot.label}
          <span className="ml-2 align-middle">
            {current ? (
              <DocumentStateBadge doc={current} />
            ) : undated.length > 0 ? (
              <Badge variant="amber">
                <span aria-hidden>!</span> On file, but nothing in force
              </Badge>
            ) : history.length > 0 ? (
              <Badge variant="amber">
                <span aria-hidden>!</span> Superseded, nothing replaced it
              </Badge>
            ) : (
              <Badge variant="amber">
                <span aria-hidden>!</span> Not on file
              </Badge>
            )}
          </span>
        </h3>
      </div>

      {current ? (
        <>
          <p className="mt-1 text-sm break-words text-neutral-800">{current.title}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {formatFileSize(current.file_size)} · filed {formatDate(current.created_at)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Backs: {slot.slot.backs}</p>
          <div className="mt-2">
            <DownloadDocumentButton
              documentId={current.id}
              companyId={companyId}
              title={current.title}
            />
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-amber-700">{slot.slot.consequenceIfMissing}</p>
      )}

      {undated.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/50 p-2">
          <p className="text-xs font-medium text-amber-800">
            {undated.length} document{undated.length === 1 ? "" : "s"} filed with no effective date —
            {" "}backing nothing
          </p>
          <ul className="mt-1 divide-y divide-amber-100">
            {undated.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} companyId={companyId} />
            ))}
          </ul>
        </div>
      ) : null}

      {history.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-600">
            History ({history.length}) — superseded versions, still on file
          </summary>
          <ul className="mt-1 divide-y divide-neutral-100">
            {history.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} companyId={companyId} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function CollectionSlot({ slot, companyId }: { slot: CabinetSlot; companyId: string }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        {slot.slot.label} ({slot.items.length})
      </h3>
      {slot.items.length === 0 ? (
        <EmptyState compact message={`No ${slot.slot.label.toLowerCase()} on file.`} />
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
          {slot.items.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} companyId={companyId} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * "What these documents unlock" — the reason the cabinet exists.
 *
 * Not a summary of the files: a list of derived facts WITH THEIR SOURCE, and of
 * facts that cannot be derived because a document is absent. Three visually
 * distinct row kinds, and the distinction is the feature:
 *
 *   verified   → green tick + evidence chip naming the document and its date
 *   recorded   → NEUTRAL. A human typed it, no usable document behind it. Never
 *                a tick, because a number a person typed is not a number the
 *                constitution says.
 *   unverified → amber `!`, names the missing input and what it costs
 *
 * Unknown must not look like verified. Conflating them is the bug that put an
 * assumed quorum into a statutory document.
 */
function FactRow({ fact }: { fact: DerivedFact }) {
  if (fact.kind === "verified") {
    return (
      <li className="px-4 py-3">
        <p className="text-sm text-neutral-900">
          <span className="text-emerald-700" aria-hidden>
            ✓{" "}
          </span>
          <span className="sr-only">Verified: </span>
          <span className="font-medium">{fact.label}</span> — {fact.value}
        </p>
        <p className="mt-1">
          <EvidenceChip
            documentLabel={`${fact.provenance.docTypeLabel}: ${fact.provenance.documentTitle}`}
            inForceFrom={formatDate(fact.provenance.inForceFrom)}
          />
        </p>
      </li>
    );
  }

  if (fact.kind === "recorded") {
    return (
      <li className="px-4 py-3">
        <p className="text-sm text-neutral-900">
          <span className="text-neutral-400" aria-hidden>
            ?{" "}
          </span>
          <span className="sr-only">Not verified: </span>
          <span className="font-medium">{fact.label}</span> — {fact.value}
        </p>
        <p className="mt-1 text-xs text-neutral-500">{fact.caveat}</p>
        <p className="mt-1">
          <Badge variant="neutral">Entered by a person · no supporting document</Badge>
        </p>
      </li>
    );
  }

  return (
    <li className="px-4 py-3">
      <p className="text-sm text-neutral-900">
        <span className="text-amber-700" aria-hidden>
          !{" "}
        </span>
        <span className="sr-only">Not verified: </span>
        <span className="font-medium">{fact.label}</span> — not verified
      </p>
      <p className="mt-1 text-xs text-neutral-600">{fact.missing}.</p>
      <p className="mt-0.5 text-xs text-amber-700">{fact.consequence}</p>
    </li>
  );
}

export async function CompanyDocumentsSection({ companyId }: { companyId: string }) {
  const cabinet = await getCompanyDocuments(companyId);
  const quorum = await getQuorumThresholdReason(companyId);
  const unlocks = buildUnlocksPanel(cabinet, quorum);
  const slots = groupIntoSlots(cabinet.documents);

  const singleSlots = slots.filter((s) => s.slot.shape === "single");
  const collectionSlots = slots.filter((s) => s.slot.shape === "collection");

  const slotsInForce: Partial<Record<DocType, { title: string; inForceFrom: string }>> = {};
  for (const s of singleSlots) {
    if (s.current && s.current.in_force_from) {
      slotsInForce[s.slot.type] = {
        title: s.current.title,
        inForceFrom: formatDate(s.current.in_force_from),
      };
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">Documents</h2>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        The documents that define this company&apos;s rules. They are what the app&apos;s checks are
        measured against — without them, a check can only say &ldquo;not verified&rdquo;.
      </p>

      {cabinet.loadFailed ? (
        <div
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          The document cabinet could not be loaded. Nothing has been checked — this is not a
          statement that no documents are on file. Reload to try again.
        </div>
      ) : (
        <>
          {/* What these documents unlock */}
          <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
            <h3 className="border-b border-neutral-200 px-4 py-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              What these documents unlock
            </h3>
            {unlocks.failed ? (
              <p className="px-4 py-3 text-sm text-amber-800" role="alert">
                <span aria-hidden>! </span>
                Could not determine what these documents verify. This is not a finding of
                &ldquo;nothing to verify&rdquo; — reload to try again.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {unlocks.facts.map((fact) => (
                  <FactRow key={fact.label} fact={fact} />
                ))}
              </ul>
            )}
          </div>

          {cabinet.documents.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No documents on file"
                message="Until a constitution is uploaded, quorum thresholds and resolution majorities cannot be verified — checks that depend on them will report “not verified”."
              />
            </div>
          ) : null}

          {/* Core (single-in-force) slots */}
          <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Core documents
          </h3>
          <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
            {singleSlots.map((slot) => (
              <SingleSlot key={slot.slot.type} slot={slot} companyId={companyId} />
            ))}
          </div>

          {collectionSlots.map((slot) => (
            <CollectionSlot key={slot.slot.type} slot={slot} companyId={companyId} />
          ))}

          <div className="mt-4">
            <UploadDocumentForm companyId={companyId} slotsInForce={slotsInForce} />
          </div>
        </>
      )}
    </section>
  );
}
