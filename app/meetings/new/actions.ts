"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attendee } from "@/lib/types";
import { MEETING_TYPES } from "@/lib/constants";

/**
 * Parses a textarea of "Name — Role" (or "Name, Role") lines, one per line,
 * into structured attendees. Lines without a separator are kept with an
 * empty role rather than dropped.
 */
function parseAttendees(raw: string): Attendee[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line
        .split(/—|,/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const [name, ...roleParts] = parts;
      return {
        name: name ?? line,
        role: roleParts.join(", "),
      };
    });
}

function buildRedirectQuery(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `?${query.toString()}`;
}

/**
 * Maps a Supabase error to a user-facing message: RLS denials (code 42501,
 * or message mentioning "row-level security") get a friendlier prompt to
 * sign in; other errors are prefixed with context.
 */
function friendlyInsertError(error: { code?: string; message: string } | null): string {
  if (!error) return "Could not create meeting: unknown error.";
  if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
    return "Sign in to save changes — browsing the demo is read-only.";
  }
  return `Could not create meeting: ${error.message}`;
}

export async function createMeeting(formData: FormData): Promise<void> {
  const companyName = String(formData.get("company_name") ?? "").trim();
  const meetingType = String(formData.get("meeting_type") ?? "").trim();
  const meetingDate = String(formData.get("meeting_date") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const chairperson = String(formData.get("chairperson") ?? "").trim();
  const attendeesRaw = String(formData.get("attendees") ?? "");

  const errors: string[] = [];
  if (!companyName) errors.push("Company name is required.");
  if (!meetingType || !MEETING_TYPES.includes(meetingType as (typeof MEETING_TYPES)[number])) {
    errors.push("Meeting type is required.");
  }
  if (!meetingDate) errors.push("Meeting date is required.");

  if (errors.length > 0) {
    const query = buildRedirectQuery({
      error: errors.join(" "),
      company_name: companyName,
      meeting_type: meetingType,
      meeting_date: meetingDate,
      venue,
      chairperson,
      attendees: attendeesRaw,
    });
    redirect(`/meetings/new${query}`);
  }

  const attendees = parseAttendees(attendeesRaw);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      company_name: companyName,
      meeting_type: meetingType,
      meeting_date: meetingDate,
      venue: venue || null,
      chairperson: chairperson || null,
      attendees: attendees.length > 0 ? attendees : null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    const query = buildRedirectQuery({
      error: friendlyInsertError(error),
      company_name: companyName,
      meeting_type: meetingType,
      meeting_date: meetingDate,
      venue,
      chairperson,
      attendees: attendeesRaw,
    });
    redirect(`/meetings/new${query}`);
  }

  redirect(`/meetings/${data.id}/transcript`);
}
