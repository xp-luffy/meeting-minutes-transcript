import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ActionItem, Meeting, MinutesDraft, Resolution } from "@/lib/types";
import { MeetingHeader } from "@/components/meeting-header";
import { ConfidenceChip, ConfidenceTag } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/types";
import { DraftBodyEditor } from "./draft-body-editor";
import { ResolutionCard } from "./resolution-card";
import { ActionItemRow } from "./action-item-row";
import { StatusWorkflow } from "./status-workflow";
import { AttendanceEditor } from "./attendance-editor";
import { RegenerateButton } from "./regenerate-button";
import { ActivityFeed, type AuditLogEntry } from "./activity-feed";

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
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <h2 className="text-base font-semibold text-neutral-900">No minutes yet</h2>
          <p className="mt-2 text-sm text-neutral-500">
            No minutes yet — add a transcript and generate.
          </p>
          <Link
            href={`/meetings/${id}/transcript`}
            className="mt-5 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add transcript
          </Link>
        </div>
      </div>
    );
  }

  const [{ data: resolutions }, { data: actionItems }, { data: auditLogs }] = await Promise.all([
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
        "id, meeting_id, description, description_source, description_confidence, description_review_status, owner_name, due_date, item_status, created_at",
      )
      .eq("meeting_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("audit_logs")
      .select("id, meeting_id, entity_type, entity_id, action, payload, created_at")
      .eq("meeting_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const typedResolutions = (resolutions ?? []) as Resolution[];
  const typedActionItems = (actionItems ?? []) as ActionItem[];
  const typedAuditLogs = (auditLogs ?? []) as AuditLogEntry[];

  const isLowConfidence =
    typedDraft.body_html_confidence !== null &&
    typedDraft.body_html_confidence !== undefined &&
    typedDraft.body_html_confidence < CONFIDENCE_REVIEW_THRESHOLD;

  const isFinal = typedDraft.status === "final";

  return (
    <div className="space-y-8">
      <MeetingHeader meeting={typedMeeting} />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-neutral-900">
              Minutes Draft v{typedDraft.version}
            </h1>
            <ConfidenceChip confidence={typedDraft.body_html_confidence} />
            <ConfidenceTag confidence={typedDraft.body_html_confidence} label="Needs review" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/meetings/${id}/transcript`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              View transcript →
            </Link>
            <ExportButtons
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

        <div
          className={`mt-4 rounded-lg border bg-white p-6 shadow-sm ${
            isLowConfidence ? "border-amber-300 ring-1 ring-amber-200" : "border-neutral-200"
          }`}
        >
          {!typedDraft.body_html ? (
            <p className="text-sm text-neutral-500">This draft has no content yet.</p>
          ) : typedDraft.body_html_source === "legacy_md" ? (
            <>
              <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-700">
                {typedDraft.body_html}
              </pre>
              <p className="mt-4 text-xs font-medium text-neutral-500">
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

      <div>
        <h2 className="text-sm font-medium text-neutral-700">Resolutions</h2>
        {typedResolutions.length === 0 ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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

      <div>
        <h2 className="text-sm font-medium text-neutral-700">Action Items</h2>
        {typedActionItems.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No action items extracted.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
            {typedActionItems.map((item) => (
              <ActionItemRow key={item.id} item={item} meetingId={id} isFinal={isFinal} />
            ))}
          </ul>
        )}
      </div>

      <ActivityFeed entries={typedAuditLogs} />
    </div>
  );
}
