import { EmptyState, EvidenceChip } from "@/components/ui";
import { StatusBanner, StatusChip, StatusGlyph } from "@/components/status";
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

/**
 * Document state — glyph AND word AND border treatment, never colour alone.
 *
 * "Superseded" is UNKNOWN rather than neutral on purpose: it is still on file
 * and still the correct authority for minutes finalised before its end date,
 * but it backs nothing NOW, and a grey pill that reads as "fine" is the same
 * mistake as a silent empty slot.
 */
function DocumentStateBadge({ doc }: { doc: CompanyDocument }) {
  const state = documentState(doc);
  if (state === "in_force") {
    return <StatusChip state="verified">In force since {formatDate(doc.in_force_from)}</StatusChip>;
  }
  if (state === "superseded") {
    return <StatusChip state="unknown">Superseded {formatDate(doc.superseded_at)}</StatusChip>;
  }
  return <StatusChip state="risk">Effective date not recorded</StatusChip>;
}

function DocumentRow({ doc, companyId }: { doc: CompanyDocument; companyId: string }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body font-medium break-words text-paper-900">{doc.title}</p>
          <DocumentStateBadge doc={doc} />
        </div>
        <p className="mt-0.5 text-caption text-paper-500">
          {DOC_TYPE_LABEL[doc.doc_type]} · {formatFileSize(doc.file_size)} · filed{" "}
          {formatDate(doc.created_at)}
        </p>
        {documentState(doc) === "undated" ? (
          <p className="mt-1 text-caption text-status-risk-700">
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
    <section className="border-b border-paper-200 px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/*
          The badge must state the TRUE state of the slot. "Not on file" when
          documents are in fact on file (but undated, or all superseded) would
          be a false statement of fact — the exact class of error this cabinet
          exists to eliminate. Three distinct empty-ish states, three messages.
        */}
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subhead font-semibold break-words text-paper-900">
          {slot.slot.label}
          <span className="align-middle">
            {current ? (
              <DocumentStateBadge doc={current} />
            ) : undated.length > 0 ? (
              <StatusChip state="risk">On file, but nothing in force</StatusChip>
            ) : history.length > 0 ? (
              <StatusChip state="risk">Superseded, nothing replaced it</StatusChip>
            ) : (
              <StatusChip state="unknown">Not on file</StatusChip>
            )}
          </span>
        </h3>
      </div>

      {current ? (
        <>
          <p className="mt-1 text-body break-words text-paper-800">{current.title}</p>
          <p className="mt-0.5 text-caption text-paper-500">
            {formatFileSize(current.file_size)} · filed {formatDate(current.created_at)}
          </p>
          <p className="mt-1 text-caption text-paper-500">Backs: {slot.slot.backs}</p>
          <div className="mt-2">
            <DownloadDocumentButton
              documentId={current.id}
              companyId={companyId}
              title={current.title}
            />
          </div>
        </>
      ) : (
        <p className="mt-1 text-caption text-status-risk-700">{slot.slot.consequenceIfMissing}</p>
      )}

      {undated.length > 0 ? (
        <div className="mt-3 rounded-surface border border-status-risk-200 bg-status-risk-50/50 p-2">
          <p className="text-caption font-medium text-status-risk-800">
            {undated.length} document{undated.length === 1 ? "" : "s"} filed with no effective date —
            {" "}backing nothing
          </p>
          <ul className="mt-1 divide-y divide-status-risk-100">
            {undated.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} companyId={companyId} />
            ))}
          </ul>
        </div>
      ) : null}

      {history.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-caption text-paper-600">
            History ({history.length}) — superseded versions, still on file
          </summary>
          <ul className="mt-1 divide-y divide-paper-100">
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
      <h3 className="mb-2 text-caption font-semibold tracking-[0.06em] text-paper-500 uppercase">
        {slot.slot.label} ({slot.items.length})
      </h3>
      {slot.items.length === 0 ? (
        <EmptyState compact message={`No ${slot.slot.label.toLowerCase()} on file.`} />
      ) : (
        <ul className="divide-y divide-paper-200 rounded-surface border border-paper-300 bg-white shadow-raised">
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
        <p className="flex flex-wrap items-center gap-2 text-body text-paper-900">
          <StatusGlyph state="verified" className="h-4 w-4 text-status-verified-700" />
          <span className="sr-only">Verified: </span>
          <span>
            <span className="font-medium">{fact.label}</span> — {fact.value}
          </span>
        </p>
        <p className="mt-1.5">
          <EvidenceChip
            documentLabel={`${fact.provenance.docTypeLabel}: ${fact.provenance.documentTitle}`}
            inForceFrom={formatDate(fact.provenance.inForceFrom)}
          />
        </p>
      </li>
    );
  }

  if (fact.kind === "recorded") {
    // A number a human typed is not a number the constitution says. UNKNOWN,
    // never a tick, and never the same neutral grey as an incidental label.
    return (
      <li className="px-4 py-3">
        <p className="flex flex-wrap items-center gap-2 text-body text-paper-900">
          <StatusGlyph state="unknown" className="h-4 w-4 text-status-unknown-700" />
          <span className="sr-only">Not verified: </span>
          <span>
            <span className="font-medium">{fact.label}</span> — {fact.value}
          </span>
        </p>
        <p className="mt-1 text-meta text-paper-600">{fact.caveat}</p>
        <p className="mt-1.5">
          <StatusChip state="unknown">Entered by a person · no supporting document</StatusChip>
        </p>
      </li>
    );
  }

  return (
    <li className="px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 text-body text-paper-900">
        <StatusGlyph state="risk" className="h-4 w-4 text-status-risk-700" />
        <span className="sr-only">Not verified: </span>
        <span>
          <span className="font-medium">{fact.label}</span> — not verified
        </span>
      </p>
      <p className="mt-1 text-meta text-paper-600">{fact.missing}.</p>
      <p className="mt-0.5 text-meta text-status-risk-800">{fact.consequence}</p>
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
        <h2 className="text-title font-semibold text-paper-900">Documents</h2>
      </div>
      <p className="mb-4 max-w-prose text-meta text-paper-600">
        The documents that define this company&apos;s rules. They are what the app&apos;s checks are
        measured against — without them, a check can only say &ldquo;not verified&rdquo;.
      </p>

      {cabinet.loadFailed ? (
        <StatusBanner state="unknown" title="The document cabinet could not be loaded">
          Nothing has been checked. This is <strong>not</strong> a statement that no documents are
          on file. Reload to try again.
        </StatusBanner>
      ) : (
        <>
          {/* What these documents unlock */}
          <div className="rounded-surface border border-paper-300 bg-white shadow-raised">
            <h3 className="border-b border-paper-200 px-4 py-3 text-subhead font-semibold text-paper-700">
              What these documents unlock
            </h3>
            {unlocks.failed ? (
              <div className="p-4">
                <StatusBanner state="unknown" title="Could not determine what these documents verify">
                  This is not a finding of &ldquo;nothing to verify&rdquo; — the derivation itself
                  failed. Reload to try again.
                </StatusBanner>
              </div>
            ) : (
              <ul className="divide-y divide-paper-100">
                {unlocks.facts.map((fact) => (
                  <FactRow key={fact.label} fact={fact} />
                ))}
              </ul>
            )}
          </div>

          {cabinet.documents.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                variant="unchecked"
                title="No documents on file"
                message="Until a constitution is uploaded, quorum thresholds and resolution majorities cannot be verified — checks that depend on them will report “not verified”."
              />
            </div>
          ) : null}

          {/* Core (single-in-force) slots */}
          <h3 className="mt-8 mb-2 text-caption font-semibold tracking-[0.06em] text-paper-500 uppercase">
            Core documents
          </h3>
          <div className="rounded-surface border border-paper-300 bg-white shadow-raised">
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
