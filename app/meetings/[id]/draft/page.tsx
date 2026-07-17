import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ActionItem, Meeting, MinutesDraft, Resolution } from "@/lib/types";
import { MeetingHeader } from "@/components/meeting-header";
import {
  Badge,
  ConfidenceChip,
  ConfidenceTag,
  ItemStatusPill,
  OutcomePill,
  StatusBadge,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/types";

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
      "id, meeting_id, transcript_id, body_html, body_html_source, body_html_confidence, body_html_review_status, status, version, created_at",
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

  const [{ data: resolutions }, { data: actionItems }] = await Promise.all([
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
  ]);

  const typedResolutions = (resolutions ?? []) as Resolution[];
  const typedActionItems = (actionItems ?? []) as ActionItem[];

  const isLowConfidence =
    typedDraft.body_html_confidence !== null &&
    typedDraft.body_html_confidence !== undefined &&
    typedDraft.body_html_confidence < CONFIDENCE_REVIEW_THRESHOLD;

  return (
    <div className="space-y-8">
      <MeetingHeader meeting={typedMeeting} />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-neutral-900">
              Minutes Draft v{typedDraft.version}
            </h1>
            <StatusBadge status={typedDraft.status} />
            <ConfidenceChip confidence={typedDraft.body_html_confidence} />
            <ConfidenceTag confidence={typedDraft.body_html_confidence} label="Needs review" />
          </div>
          <Link
            href={`/meetings/${id}/transcript`}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            View transcript →
          </Link>
        </div>

        <div
          className={`mt-4 rounded-lg border bg-white p-6 shadow-sm ${
            isLowConfidence ? "border-amber-300 ring-1 ring-amber-200" : "border-neutral-200"
          }`}
        >
          {!typedDraft.body_html ? (
            <p className="text-sm text-neutral-500">This draft has no content yet.</p>
          ) : typedDraft.body_html_source === "legacy_md" ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-700">
              {typedDraft.body_html}
            </pre>
          ) : (
            <div
              className="minutes-body"
              dangerouslySetInnerHTML={{ __html: typedDraft.body_html }}
            />
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-700">Resolutions</h2>
        {typedResolutions.length === 0 ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No resolutions extracted — please review transcript.
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {typedResolutions.map((resolution) => {
              const lowConfidence =
                resolution.resolution_text_confidence !== null &&
                resolution.resolution_text_confidence !== undefined &&
                resolution.resolution_text_confidence < CONFIDENCE_REVIEW_THRESHOLD;
              return (
                <li
                  key={resolution.id}
                  className={`rounded-lg border bg-white p-4 shadow-sm ${
                    lowConfidence
                      ? "border-neutral-200 border-l-4 border-l-amber-400"
                      : "border-neutral-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900">
                        {resolution.resolution_number ?? "—"}
                      </span>
                      <OutcomePill outcome={resolution.outcome} />
                      {lowConfidence ? (
                        <Badge variant="amber">Low confidence — review</Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-neutral-700">{resolution.resolution_text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-700">Action Items</h2>
        {typedActionItems.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No action items extracted.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
            {typedActionItems.map((item) => {
              const lowConfidence =
                item.description_confidence !== null &&
                item.description_confidence !== undefined &&
                item.description_confidence < CONFIDENCE_REVIEW_THRESHOLD;
              return (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-center justify-between gap-3 p-4 ${
                    lowConfidence ? "bg-amber-50/50" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-800">{item.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      {item.owner_name ? (
                        <span>{item.owner_name}</span>
                      ) : (
                        <Badge variant="amber">No owner</Badge>
                      )}
                      <span>&middot; Due {formatDate(item.due_date)}</span>
                      {lowConfidence ? <Badge variant="amber">Low confidence</Badge> : null}
                    </div>
                  </div>
                  <ItemStatusPill status={item.item_status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
