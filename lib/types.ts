export type MeetingStatus = "draft" | "reviewed" | "final";

export interface Attendee {
  name: string;
  role: string;
}

export interface Meeting {
  id: string;
  company_name: string;
  meeting_type: string;
  meeting_date: string;
  venue: string | null;
  chairperson: string | null;
  attendees: Attendee[] | null;
  quorum_met: boolean | null;
  status: MeetingStatus;
  minutes_format?: "standard" | "maisca";
  created_at: string;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  raw_text: string;
  source_type: "paste" | "upload";
  word_count: number | null;
  created_at: string;
}

export interface MinutesDraft {
  id: string;
  meeting_id: string;
  transcript_id: string | null;
  body_html: string | null;
  body_html_source: string | null;
  body_html_confidence: number | null;
  body_html_review_status: "unreviewed" | "approved" | "amended";
  status: MeetingStatus;
  version: number;
  reviewed_at: string | null;
  finalised_at: string | null;
  created_at: string;
}

export interface Resolution {
  id: string;
  meeting_id: string;
  resolution_number: string | null;
  resolution_text: string;
  resolution_text_source: string | null;
  resolution_text_confidence: number | null;
  resolution_text_review_status: string | null;
  outcome: "carried" | "deferred" | "lapsed";
  created_at: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  description: string;
  description_source: string | null;
  description_confidence: number | null;
  description_review_status: string | null;
  /**
   * What the minutes literally SAY the owner is. The statutory record; never
   * rewritten by a later linking decision. May be a role ("Finance"), a
   * partial name ("Aisyah"), or null.
   */
  owner_name: string | null;
  /**
   * Overlay link to a real person (`entities.id`, kind='person'), or null.
   * Combined with owner_name this gives the three owner states — see
   * `ownerState()` in lib/owners.ts. Optional on the type because several
   * legacy select lists predate migration 0017; read it only where the
   * column is explicitly selected, and use `ownerState()` so an absent
   * column can never be mistaken for "not linked".
   */
  owner_entity_id?: string | null;
  due_date: string | null;
  item_status: "open" | "done";
  created_at: string;
}

export const CONFIDENCE_REVIEW_THRESHOLD = 0.75;

export interface GeneratedMinutes {
  quorum_met: boolean;
  minutes_body_html: string;
  body_confidence: number;
  resolutions: {
    number: string;
    text: string;
    outcome: "carried" | "deferred" | "lapsed";
    confidence: number;
  }[];
  action_items: {
    description: string;
    owner: string | null;
    due_date: string | null; // ISO yyyy-mm-dd
    confidence: number;
  }[];
}
