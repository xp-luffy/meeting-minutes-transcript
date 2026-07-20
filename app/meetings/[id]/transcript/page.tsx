import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Meeting, Transcript } from "@/lib/types";
import { MeetingHeader } from "@/components/meeting-header";
import { TranscriptEditor } from "./transcript-editor";

export default async function TranscriptPage({
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

  const { data: transcript } = await supabase
    .from("transcripts")
    .select("id, meeting_id, raw_text, source_type, word_count, created_at")
    .eq("meeting_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const typedMeeting = meeting as Meeting;
  const typedTranscript = (transcript ?? null) as Transcript | null;

  return (
    <div className="space-y-6">
      <MeetingHeader meeting={typedMeeting} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-body font-medium text-paper-700">Transcript</h2>
        <Link
          href={`/meetings/${id}/draft`}
          className="focus-ring rounded text-caption font-medium text-ink-600 hover:text-ink-700"
        >
          View draft →
        </Link>
      </div>

      <TranscriptEditor
        meetingId={id}
        initialText={typedTranscript?.raw_text ?? ""}
        initialTranscriptId={typedTranscript?.id ?? null}
      />
    </div>
  );
}
