import { createClient } from "@/lib/supabase/server";
import type { Attendee, Meeting, MinutesDraft, Resolution, ActionItem } from "@/lib/types";

/**
 * Company memory: the per-company institutional record a cosec relies on —
 * usual venue/chair/attendees/format, meeting history, the resolutions
 * register, and open action items. Mirrors the shape of lib/workspace.ts:
 * plain selects that lean on RLS (see supabase/migrations/0006_insights_v2.sql
 * `companies_read`/`companies_update`) to scope visibility, rather than
 * re-deriving ownership rules in application code.
 */

export interface CompanyDefaults {
  venue?: string | null;
  chairperson?: string | null;
  attendees?: Attendee[] | null;
  minutes_format?: "standard" | "maisca" | null;
  meeting_type?: string | null;
}

export interface Company {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  name: string;
  reg_no: string | null;
  defaults: CompanyDefaults | null;
  created_at: string;
}

const COMPANY_COLUMNS = "id, user_id, workspace_id, name, reg_no, defaults, created_at";

/** Companies visible to the session user, ordered by name (RLS scopes the rows). */
export async function getMyCompanies(): Promise<Company[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data as Company[];
}

/** A single company by id, or null if it doesn't exist or RLS hides it (caller should notFound()). */
export async function getCompany(id: string): Promise<Company | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Company;
}

export interface CompanyHistoryMeeting extends Meeting {
  latestDraft?: MinutesDraft;
}

export interface CompanyHistoryResolution extends Resolution {
  meeting_date: string;
  meeting_type: string;
}

export interface CompanyOpenAction extends ActionItem {
  meeting_date: string;
}

export interface CompanyHistory {
  meetings: CompanyHistoryMeeting[];
  resolutions: CompanyHistoryResolution[];
  openActions: CompanyOpenAction[];
}

const EMPTY_HISTORY: CompanyHistory = { meetings: [], resolutions: [], openActions: [] };

/**
 * The institutional-memory view for one company: every meeting (with its
 * latest draft status), the last 50 resolutions (with meeting date/type),
 * and every open action item (ordered by due date).
 *
 * Fetches meeting ids first, then all child rows in bulk (one query per
 * child table across every meeting id) — avoids N+1 queries for companies
 * with a long history.
 */
export async function getCompanyHistory(companyId: string): Promise<CompanyHistory> {
  const supabase = await createClient();

  const { data: meetingsData, error: meetingsError } = await supabase
    .from("meetings")
    .select(
      "id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status, minutes_format, created_at",
    )
    .eq("company_id", companyId)
    .order("meeting_date", { ascending: false });

  if (meetingsError || !meetingsData) return EMPTY_HISTORY;

  const meetings = meetingsData as Meeting[];
  const meetingIds = meetings.map((m) => m.id);
  if (meetingIds.length === 0) return EMPTY_HISTORY;

  const meetingDateById = new Map(meetings.map((m) => [m.id, m.meeting_date]));
  const meetingTypeById = new Map(meetings.map((m) => [m.id, m.meeting_type]));

  const [draftsResult, resolutionsResult, actionsResult] = await Promise.all([
    supabase
      .from("minutes_drafts")
      .select(
        "id, meeting_id, transcript_id, body_html, body_html_source, body_html_confidence, body_html_review_status, status, version, reviewed_at, finalised_at, created_at",
      )
      .in("meeting_id", meetingIds)
      .order("version", { ascending: false }),
    supabase
      .from("resolutions")
      .select(
        "id, meeting_id, resolution_number, resolution_text, resolution_text_source, resolution_text_confidence, resolution_text_review_status, outcome, created_at",
      )
      .in("meeting_id", meetingIds)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("action_items")
      .select(
        "id, meeting_id, description, description_source, description_confidence, description_review_status, owner_name, due_date, item_status, created_at",
      )
      .in("meeting_id", meetingIds)
      .eq("item_status", "open")
      .order("due_date", { ascending: true }),
  ]);

  const latestDraftByMeeting = new Map<string, MinutesDraft>();
  if (!draftsResult.error && draftsResult.data) {
    for (const draft of draftsResult.data as MinutesDraft[]) {
      if (!latestDraftByMeeting.has(draft.meeting_id)) {
        latestDraftByMeeting.set(draft.meeting_id, draft);
      }
    }
  }

  const meetingsWithDrafts: CompanyHistoryMeeting[] = meetings.map((m) => ({
    ...m,
    latestDraft: latestDraftByMeeting.get(m.id),
  }));

  const resolutions: CompanyHistoryResolution[] = (
    (resolutionsResult.error ? [] : (resolutionsResult.data ?? [])) as Resolution[]
  ).map((r) => ({
    ...r,
    meeting_date: meetingDateById.get(r.meeting_id) ?? "",
    meeting_type: meetingTypeById.get(r.meeting_id) ?? "",
  }));

  const openActions: CompanyOpenAction[] = (
    (actionsResult.error ? [] : (actionsResult.data ?? [])) as ActionItem[]
  ).map((a) => ({
    ...a,
    meeting_date: meetingDateById.get(a.meeting_id) ?? "",
  }));

  return { meetings: meetingsWithDrafts, resolutions, openActions };
}

export interface CompanyStats {
  meetingCount: number;
  openActionCount: number;
  lastMeetingDate: string | null;
}

/**
 * Meeting count, open action-item count, and last meeting date for a batch
 * of companies — one `meetings` select (grouped in JS) plus one
 * `action_items` select for those meetings' ids, so the /companies list
 * page never does one query per company.
 */
export async function getCompanyStatsMap(companyIds: string[]): Promise<Map<string, CompanyStats>> {
  const stats = new Map<string, CompanyStats>();
  for (const id of companyIds) {
    stats.set(id, { meetingCount: 0, openActionCount: 0, lastMeetingDate: null });
  }
  if (companyIds.length === 0) return stats;

  const supabase = await createClient();
  const { data: meetings, error } = await supabase
    .from("meetings")
    .select("id, company_id, meeting_date")
    .in("company_id", companyIds);

  if (error || !meetings) return stats;

  const meetingRows = meetings as { id: string; company_id: string | null; meeting_date: string }[];
  const meetingCompanyById = new Map<string, string>();

  for (const m of meetingRows) {
    if (!m.company_id) continue;
    meetingCompanyById.set(m.id, m.company_id);
    const entry = stats.get(m.company_id) ?? { meetingCount: 0, openActionCount: 0, lastMeetingDate: null };
    entry.meetingCount += 1;
    if (!entry.lastMeetingDate || m.meeting_date > entry.lastMeetingDate) {
      entry.lastMeetingDate = m.meeting_date;
    }
    stats.set(m.company_id, entry);
  }

  const allMeetingIds = [...meetingCompanyById.keys()];
  if (allMeetingIds.length > 0) {
    const { data: actions } = await supabase
      .from("action_items")
      .select("meeting_id")
      .in("meeting_id", allMeetingIds)
      .eq("item_status", "open");

    for (const a of (actions ?? []) as { meeting_id: string }[]) {
      const companyId = meetingCompanyById.get(a.meeting_id);
      if (!companyId) continue;
      const entry = stats.get(companyId);
      if (entry) entry.openActionCount += 1;
    }
  }

  return stats;
}

/**
 * Writes a meeting's venue/chairperson/attendees/minutes_format/meeting_type
 * back into its company's `defaults` (last-write-wins) — the mechanism that
 * makes company memory improve with every meeting, so the next `/meetings/new`
 * for this company starts pre-filled. No-ops if the meeting has no
 * `company_id` or can't be read (RLS-hidden, wrong id, etc).
 */
export async function upsertCompanyDefaultsFromMeeting(meetingId: string): Promise<void> {
  const supabase = await createClient();
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("id, company_id, venue, chairperson, attendees, minutes_format, meeting_type")
    .eq("id", meetingId)
    .maybeSingle();

  if (error || !meeting) return;

  const meetingRow = meeting as {
    company_id: string | null;
    venue: string | null;
    chairperson: string | null;
    attendees: Attendee[] | null;
    minutes_format: "standard" | "maisca" | null;
    meeting_type: string;
  };

  if (!meetingRow.company_id) return;

  const defaults: CompanyDefaults = {
    venue: meetingRow.venue ?? null,
    chairperson: meetingRow.chairperson ?? null,
    attendees: meetingRow.attendees ?? null,
    minutes_format: meetingRow.minutes_format ?? null,
    meeting_type: meetingRow.meeting_type ?? null,
  };

  await supabase.from("companies").update({ defaults }).eq("id", meetingRow.company_id);
}
