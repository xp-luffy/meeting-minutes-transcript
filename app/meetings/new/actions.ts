"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attendee } from "@/lib/types";
import { MEETING_TYPES } from "@/lib/constants";
import { getCompany, upsertCompanyDefaultsFromMeeting, type CompanyDefaults } from "@/lib/companies";
import { NEW_COMPANY_VALUE } from "@/lib/constants";

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
  const companyIdRaw = String(formData.get("company_id") ?? "").trim();
  const companyNameRaw = String(formData.get("company_name") ?? "").trim();
  const meetingType = String(formData.get("meeting_type") ?? "").trim();
  const meetingDate = String(formData.get("meeting_date") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const chairperson = String(formData.get("chairperson") ?? "").trim();
  const attendeesRaw = String(formData.get("attendees") ?? "");
  const minutesFormatRaw = String(formData.get("minutes_format") ?? "standard");
  const minutesFormat = minutesFormatRaw === "maisca" ? "maisca" : "standard";
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();

  const isNewCompany = !companyIdRaw || companyIdRaw === NEW_COMPANY_VALUE;

  const redirectFields: Record<string, string> = {
    company_id: companyIdRaw,
    company_name: companyNameRaw,
    meeting_type: meetingType,
    meeting_date: meetingDate,
    venue,
    chairperson,
    attendees: attendeesRaw,
    minutes_format: minutesFormatRaw,
    workspace_id: workspaceId,
  };

  const errors: string[] = [];
  if (isNewCompany && !companyNameRaw) errors.push("Company name is required.");
  if (!meetingType || !MEETING_TYPES.includes(meetingType as (typeof MEETING_TYPES)[number])) {
    errors.push("Meeting type is required.");
  }
  if (!meetingDate) errors.push("Meeting date is required.");

  if (errors.length > 0) {
    redirect(`/meetings/new${buildRedirectQuery({ error: errors.join(" "), ...redirectFields })}`);
  }

  const supabase = await createClient();

  // Resolve the company: either load the existing one (for its name +
  // defaults) or create a new one now, scoped to the chosen workspace.
  let companyId: string | null = null;
  let companyName = companyNameRaw;
  let companyDefaults: CompanyDefaults | null = null;

  if (isNewCompany) {
    const { data: newCompany, error: companyError } = await supabase
      .from("companies")
      .insert({ name: companyNameRaw, workspace_id: workspaceId || null })
      .select("id, name")
      .single();

    if (companyError || !newCompany) {
      redirect(
        `/meetings/new${buildRedirectQuery({
          error: friendlyInsertError(companyError),
          ...redirectFields,
        })}`,
      );
    }

    companyId = newCompany.id;
    companyName = newCompany.name;
  } else {
    const company = await getCompany(companyIdRaw);
    if (!company) {
      redirect(
        `/meetings/new${buildRedirectQuery({
          error: "That company could not be found. Pick another, or create a new one.",
          ...redirectFields,
        })}`,
      );
    }
    companyId = company.id;
    companyName = company.name;
    companyDefaults = company.defaults;
  }

  // Explicit user input always wins; an empty field falls back to the
  // company's usual default, if it has one on record.
  const effectiveVenue = venue || companyDefaults?.venue || "";
  const effectiveChairperson = chairperson || companyDefaults?.chairperson || "";
  const attendeesFromForm = parseAttendees(attendeesRaw);
  const effectiveAttendees =
    attendeesFromForm.length > 0 ? attendeesFromForm : companyDefaults?.attendees ?? [];

  // The format select's "standard" option doubles as "unset" — if the user
  // left it there and the company's usual style is Maisca, use that;
  // otherwise the user's explicit choice (standard or maisca) always wins.
  const effectiveMinutesFormat: "standard" | "maisca" =
    minutesFormatRaw === "standard" && companyDefaults?.minutes_format === "maisca"
      ? "maisca"
      : minutesFormat;

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      company_id: companyId,
      company_name: companyName,
      meeting_type: meetingType,
      meeting_date: meetingDate,
      venue: effectiveVenue || null,
      chairperson: effectiveChairperson || null,
      attendees: effectiveAttendees.length > 0 ? effectiveAttendees : null,
      status: "draft",
      workspace_id: workspaceId || null,
      minutes_format: effectiveMinutesFormat,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/meetings/new${buildRedirectQuery({
        error: friendlyInsertError(error),
        ...redirectFields,
      })}`,
    );
  }

  // Memory improves with every meeting: fold this meeting's fields back
  // into the company's defaults (last-write-wins) for next time.
  await upsertCompanyDefaultsFromMeeting(data.id);

  redirect(`/meetings/${data.id}/transcript`);
}
