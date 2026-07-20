"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SaveTranscriptResult {
  error?: string;
  transcriptId?: string;
  wordCount?: number;
}

/**
 * Maps a Supabase RLS-denial error (code 42501, or message mentioning
 * "row-level security") to a friendlier message; passes other errors through
 * unchanged.
 */
function friendlyRlsMessage(error: { code?: string; message: string }): string {
  if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
    return "Your session has expired — sign in again to save changes.";
  }
  return error.message;
}

/**
 * Inserts a new transcript row for the meeting (transcripts are append-only —
 * each save creates a new row rather than mutating an existing one).
 */
export async function saveTranscript(
  meetingId: string,
  rawText: string,
  sourceType: "paste" | "upload",
): Promise<SaveTranscriptResult> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { error: "Transcript text cannot be empty." };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transcripts")
    .insert({
      meeting_id: meetingId,
      raw_text: rawText,
      source_type: sourceType,
      word_count: wordCount,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error ? friendlyRlsMessage(error) : "Could not save transcript." };
  }

  revalidatePath(`/meetings/${meetingId}/transcript`);

  return { transcriptId: data.id, wordCount };
}
