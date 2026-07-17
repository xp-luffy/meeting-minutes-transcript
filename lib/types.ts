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
  owner_name: string | null;
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
