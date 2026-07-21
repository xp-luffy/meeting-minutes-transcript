import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ActionItem, Meeting, MinutesDraft, Resolution } from "@/lib/types";
import { MeetingHeader } from "@/components/meeting-header";
import { ConfidenceChip, EmptyState, FOCUS_RING } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/types";
import { DraftBodyEditor } from "./draft-body-editor";
import { ResolutionCard } from "./resolution-card";
import { ActionItemRow } from "./action-item-row";
import { StatusWorkflow } from "./status-workflow";
import { AttendanceEditor } from "./attendance-editor";
import { RegenerateButton } from "./regenerate-button";
import { ActivityFeed, type AuditLogEntry } from "./activity-feed";
import { PrecedentPanel } from "./precedent-panel";
import { SendForReview } from "./send-for-review";
import { AssurancePanel } from "./assurance-panel";
import { ConfirmationStatus } from "./confirmation-status";
import { ObligationsPanel } from "./obligations-panel";
import { GovernanceRiskPanel } from "./governance-risk-panel";
import type { AssuranceCheck } from "@/lib/assurance";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select(
      "id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (meetingError || !meeting) {
    notFound();
  }

  const typedMeeting = meeting as Meeting;

  const { data: draft } = await supabase
    .from("minutes_drafts")
    .select(
      "id, meeting_id, transcript_id, body_html, body_html_source, body_html_confidence, body_html_review_status, status, version, reviewed_at, finalised_at, created_at",
    )
    .eq("meeting_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const typedDraft = (draft ?? null) as MinutesDraft | null;

  if (!typedDraft) {
    return (
      <div className="space-y-6">
        <MeetingHeader meeting={typedMeeting} />
        <EmptyState
          title="No minutes yet"
          message="Add a transcript and generate to create the first draft."
          action={
            <Link
              href={`/meetings/${id}/transcript`}
              className={`inline-flex min-h-11 items-center rounded-surface bg-ink-600 px-4 py-2 text-body font-medium text-white hover:bg-ink-700 sm:min-h-0 ${FOCUS_RING}`}
            >
              Add transcript
            </Link>
          }
        />
      </div>
    );
  }

  // Errors are captured, not discarded. detectConflicts was hardened to return
  // null on a failed read, but the SAME false all-clear reached the same panel
  // through here: if the resolutions or transcript read failed, this file
  // passed [] and "" into GovernanceRiskPanel, checkConsistency found no
  // numbers and no text to disagree about, and the panel painted the green
  // "No conflicts or contradictions detected across the record" — again from a
  // query that never returned. Hardening one input is not hardening the panel.
  const [
    { data: resolutions, error: resolutionsError },
    { data: actionItems, error: actionItemsError },
    { data: auditLogs },
    { data: assuranceRow },
    { data: transcriptRow, error: transcriptError },
  ] = await Promise.all([
    supabase
      .from("resolutions")
      .select(
        "id, meeting_id, resolution_number, resolution_text, resolution_text_source, resolution_text_confidence, resolution_text_review_status, outcome, created_at",
      )
      .eq("meeting_id", id)
      .order("resolution_number", { ascending: true }),
    supabase
      .from("action_items")
      .select(
        "id, meeting_id, description, description_source, description_confidence, description_review_status, owner_name, owner_entity_id, due_date, item_status, created_at",
      )
      .eq("meeting_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("audit_logs")
      .select("id, meeting_id, entity_type, entity_id, action, payload, created_at")
      .eq("meeting_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("assurance_reports")
      .select("id, results, score, acknowledged_at, acknowledged_note, created_at")
      .eq("draft_id", typedDraft.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("transcripts")
      .select("raw_text")
      .eq("meeting_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const assuranceReport = assuranceRow
    ? {
        id: assuranceRow.id as string,
        results: (assuranceRow.results ?? []) as AssuranceCheck[],
        score: Number(assuranceRow.score ?? 0),
        acknowledged_at: (assuranceRow.acknowledged_at ?? null) as string | null,
        acknowledged_note: (assuranceRow.acknowledged_note ?? null) as string | null,
        created_at: assuranceRow.created_at as string,
      }
    : null;

  const transcriptText = ((transcriptRow?.raw_text as string | undefined) ?? "");

  const typedResolutions = (resolutions ?? []) as Resolution[];
  const typedActionItems = (actionItems ?? []) as ActionItem[];
  const typedAuditLogs = (auditLogs ?? []) as AuditLogEntry[];

  // Names for linked owners. Ids missing from this result are people RLS hides
  // from the caller — the row then says "Owner not visible to you" rather than
  // rendering blank, which would read as "unassigned" (a different, worse fact).
  const ownerEntityIds = Array.from(
    new Set(
      typedActionItems.map((item) => item.owner_entity_id).filter((v): v is string => Boolean(v)),
    ),
  );
  const ownerNameById = new Map<string, string>();
  if (ownerEntityIds.length > 0) {
    const { data: ownerRows } = await supabase
      .from("entities")
      .select("id, canonical_name")
      .in("id", ownerEntityIds);
    for (const row of (ownerRows ?? []) as { id: string; canonical_name: string }[]) {
      ownerNameById.set(row.id, row.canonical_name);
    }
  }

  const isLowConfidence =
    typedDraft.body_html_confidence !== null &&
    typedDraft.body_html_confidence !== undefined &&
    typedDraft.body_html_confidence < CONFIDENCE_REVIEW_THRESHOLD;

  const isFinal = typedDraft.status === "final";

  return (
    <div className="space-y-8">
      <MeetingHeader meeting={typedMeeting} />

      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-page font-semibold text-paper-900">
              Minutes Draft v{typedDraft.version}
            </h1>
            {/*
              ConfidenceChip now covers all three cases on its own — measured
              and fine, measured and low, and NEVER MEASURED. Rendering
              ConfidenceTag beside it would print the same "not measured" chip
              twice.
            */}
            <ConfidenceChip confidence={typedDraft.body_html_confidence} />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href={`/meetings/${id}/transcript`}
              className={`text-caption font-medium text-ink-600 hover:text-ink-700 ${FOCUS_RING} rounded-control`}
            >
              View transcript →
            </Link>
            <ExportButtons
              meetingId={typedMeeting.id}
              draftId={typedDraft.id}
              disabled={!typedDraft.body_html || typedDraft.body_html.length === 0}
            />
            <SendForReview
              meetingId={typedMeeting.id}
              draftId={typedDraft.id}
              disabled={!typedDraft.body_html || typedDraft.body_html.length === 0}
            />
            {!isFinal ? <RegenerateButton meetingId={id} /> : null}
            <StatusWorkflow
              draftId={typedDraft.id}
              meetingId={id}
              status={typedDraft.status}
              finalisedAt={typedDraft.finalised_at}
            />
          </div>
        </div>

        <div className="mt-3">
          <ConfirmationStatus
            meetingId={id}
            draftId={typedDraft.id}
            meetingDate={typedMeeting.meeting_date}
            draftStatus={typedDraft.status}
          />
        </div>

        {/* rule-document: the double rule, once per page, over the statutory
            record itself. It is the screen's echo of the DRAFT stamp on the
            export, and the only thing on the page ranked above a section. */}
        <div
          className={`rule-document mt-6 rounded-surface border bg-white p-6 ${
            isLowConfidence ? "border-status-risk-300 ring-1 ring-status-risk-200" : "border-paper-300"
          }`}
        >
          {!typedDraft.body_html ? (
            <p className="text-body text-paper-600">This draft has no content yet.</p>
          ) : typedDraft.body_html_source === "legacy_md" ? (
            <>
              <pre className="whitespace-pre-wrap font-sans text-body text-paper-700">
                {typedDraft.body_html}
              </pre>
              <p className="mt-4 text-caption font-medium text-paper-600">
                Legacy draft — regenerate to edit.
              </p>
            </>
          ) : (
            <DraftBodyEditor
              draftId={typedDraft.id}
              meetingId={id}
              initialHtml={typedDraft.body_html}
              isFinal={isFinal}
            />
          )}
        </div>
      </div>

      <AttendanceEditor
        meetingId={id}
        initialAttendees={typedMeeting.attendees ?? []}
        initialQuorumMet={typedMeeting.quorum_met}
        isFinal={isFinal}
      />

      <div className="rule-section">
        <h2 className="text-subhead font-medium text-paper-700">Resolutions</h2>
        {resolutionsError ? (
          // "No resolutions extracted" is a claim about the record. If the read
          // failed we do not know what is in it, and must not say we do.
          <div className="mt-3 rounded-surface border border-dashed border-paper-450 bg-paper-50 px-4 py-3 text-body text-paper-700">
            Resolutions could not be loaded — this is not the same as there being none.
            Reload before relying on this page.
          </div>
        ) : typedResolutions.length === 0 ? (
          <div className="mt-3 rounded-surface border border-status-risk-200 bg-status-risk-50 px-4 py-3 text-body text-status-risk-800">
            No resolutions extracted — please review transcript.
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {typedResolutions.map((resolution) => (
              <ResolutionCard
                key={resolution.id}
                resolution={resolution}
                meetingId={id}
                isFinal={isFinal}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="rule-section">
        <h2 className="text-subhead font-medium text-paper-700">Action Items</h2>
        {actionItemsError ? (
          // Same class as the resolutions claim directly above: "No action
          // items extracted" is a statement about the record. The error was
          // already captured here and then not used — the fix was applied to
          // resolutions and missed on the very next block.
          <div className="mt-3 rounded-surface border border-dashed border-paper-450 bg-paper-50 px-4 py-3 text-body text-paper-700">
            Action items could not be loaded — this is not the same as there being none.
            Reload before relying on this page.
          </div>
        ) : typedActionItems.length === 0 ? (
          <p className="mt-3 text-body text-paper-600">No action items extracted.</p>
        ) : (
          <ul className="mt-3 divide-y divide-paper-200 rounded-surface border border-paper-300 bg-white">
            {typedActionItems.map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                meetingId={id}
                isFinal={isFinal}
                ownerDisplayName={
                  item.owner_entity_id ? (ownerNameById.get(item.owner_entity_id) ?? null) : null
                }
              />
            ))}
          </ul>
        )}
      </div>

      <AssurancePanel
        report={assuranceReport}
        meetingId={id}
        draftId={typedDraft.id}
        isFinal={isFinal}
      />

      <GovernanceRiskPanel
        meetingId={id}
        bodyHtml={typedDraft.body_html ?? ""}
        transcriptText={transcriptText}
        quorumMet={typedMeeting.quorum_met}
        attendees={typedMeeting.attendees}
        resolutions={typedResolutions}
        inputsFailed={Boolean(resolutionsError || transcriptError)}
      />

      <ObligationsPanel meetingId={id} />

      <PrecedentPanel meetingId={id} />

      <ActivityFeed entries={typedAuditLogs} />
    </div>
  );
}
