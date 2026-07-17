"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SaveTranscriptResult {
  error?: string;
  transcriptId?: string;
  wordCount?: number;
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
    return { error: error?.message ?? "Could not save transcript." };
  }

  revalidatePath(`/meetings/${meetingId}/transcript`);

  return { transcriptId: data.id, wordCount };
}
