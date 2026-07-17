import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MeetingRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (meetingError || !meeting) {
    notFound();
  }

  const { data: draft } = await supabase
    .from("minutes_drafts")
    .select("id")
    .eq("meeting_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draft) {
    redirect(`/meetings/${id}/draft`);
  }

  redirect(`/meetings/${id}/transcript`);
}
