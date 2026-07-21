import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { generateMinutesRuleBased, meetingTypeGuidance } from "@/lib/minutes-engine";
import { runAssurance } from "@/lib/assurance";
import { getQuorumThreshold } from "@/lib/company-documents";
import { deriveObligations } from "@/lib/obligations";
import { resolveEntitiesForMeeting } from "@/lib/entities";
import type { GeneratedMinutes, Meeting, Transcript } from "@/lib/types";

/**
 * POST /api/generate-minutes
 * Body: { meetingId: string, transcriptId?: string }
 *
 * Success: 200 { draftId: string, warnings: string[] }
 * Error:   4xx/5xx { error: string }
 *
 * Loads the meeting + transcript, generates statutory minutes (OpenAI GPT-4o
 * when OPENAI_API_KEY is set, otherwise a deterministic rule-based engine),
 * then writes a new minutes_drafts version plus resolutions/action_items
 * (regeneration semantics: prior non-manual rows for the meeting are replaced).
 */

// Rough token estimate: ~4 chars/token. Keep prompts well under the model's
// context window.
const MAX_TRANSCRIPT_TOKENS = 15000;
const MAX_TRANSCRIPT_CHARS = MAX_TRANSCRIPT_TOKENS * 4;

// --- Rate limiting ---------------------------------------------------------
// Simple in-memory sliding window, keyed by IP: max 5 requests / 60s.
// NOTE: this state is per-instance (module-level Map), so it resets on cold
// start and isn't shared across serverless instances — fine for v1, but a
// real deployment with multiple instances would need a shared store (e.g.
// Redis) for a hard global limit.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const requestTimestampsByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestTimestampsByIp.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestTimestampsByIp.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestTimestampsByIp.set(ip, recent);
  return false;
}

const GeneratedMinutesSchema = z.object({
  quorum_met: z.boolean(),
  minutes_body_html: z.string().min(1),
  body_confidence: z.number().min(0).max(1),
  resolutions: z.array(
    z.object({
      number: z.string(),
      text: z.string().min(1),
      outcome: z.enum(["carried", "deferred", "lapsed"]),
      confidence: z.number().min(0).max(1),
    }),
  ),
  action_items: z.array(
    z.object({
      description: z.string().min(1),
      owner: z.string().nullable(),
      due_date: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

/**
 * Meeting-type-aware system prompt: the JSON contract is identical across
 * all meeting types (so the zod schema below always validates), but the
 * guidance paragraph is generated per meeting_type from the same profile
 * config the rule-based engine uses (lib/minutes-engine.ts), so both
 * generation paths describe the same statutory numbering convention,
 * section naming, and phrasing for a given type.
 */
function buildSystemPrompt(meeting: Meeting): string {
  const typeGuidance = meetingTypeGuidance(meeting.meeting_type);

  const maiscaGuidance =
    meeting.minutes_format === "maisca"
      ? `

HOUSE FORMAT OVERRIDE — "Maisca committee style". The minutes_body_html must follow this committee-minutes layout instead of the generic section layout described below (the JSON contract is unchanged; only the HTML body layout differs):
1. A header block as a 2-column <table> (th label / td value) with rows: "Meeting" (value "${meeting.meeting_type} No.01/<2-digit year of the meeting date>", e.g. "Event Committee No.02/26" style), "Date" (formatted "Tuesday, 16 June 2026" — weekday, day Month year), "Time" (ONLY if the transcript states when the meeting was called to order/opened — otherwise omit the row entirely; format "02:30 p.m."), and "Venue".
2. An <h3>Attendees</h3> section: a <table> with <thead> columns Name / Designation / Attendance, one row per attendee with "1/1" in the Attendance cell. Exclude attendees whose role mentions apologies — list those after the table under an "Absent with Apologies" heading. Attendees whose role indicates "in attendance" or observer status go in a separate "In Attendance:" list (omit if none).
3. An <h3>Quorum</h3> section: "In accordance with the Terms of Reference, N members of the Committee including the Chairman or Deputy Chairman present shall form a quorum." where N is the majority (floor(members/2)+1) of non-apology attendees; append "A quorum was present." if the transcript confirms quorum.
4. An <h3>Address by Chairman</h3> section: a fixed confidentiality paragraph — the chairman reminded members of their Confidentiality Undertaking, requested declaration of interests in matters to be discussed, and reminded members that no Committee deliberations may be disclosed verbally, in writing, or through any digital medium (including SMS, WhatsApp, or social media) without the Chairman's prior authorisation.
5. An <h3>Agenda</h3> section: a 3-column <table> with <thead> columns "Item" / "Agenda &amp; Discussions" / "Dept.". Items are numbered 1.0, 2.0, 3.0... Each Agenda &amp; Discussions cell starts with an UPPERCASE <strong> heading. The first item is "WELCOME REMARKS" (brief chairman-welcomed-members sentence). If the transcript mentions confirming previous minutes, include an item "MINUTES OF THE PREVIOUS MEETING" whose text ends "...were confirmed as a correct record." Then one item per discussion topic: the narrative, then each decision inline in bold as "The Committee RESOLVED that ..." (deferrals as "... was deferred pending ..."), then any action items for that topic inline as "Action: <owner> to <task> by <date>." Leave every Dept. cell empty in this version. The final item is "CLOSE OF MEETING" ("There being no other business, the meeting was closed at <time>." — include the time only if the transcript states it).
Use plain semantic <table>/<thead>/<tbody>/<tr>/<th>/<td> markup with NO inline styles.`
      : "";

  return `You are a statutory minutes drafting assistant for Malaysian company secretaries. Given a raw meeting transcript and meeting metadata, extract structured minutes.

This meeting's type is "${meeting.meeting_type}". Statutory conventions for this type: ${typeGuidance}${maiscaGuidance}

Respond with ONLY a single JSON object (no markdown, no commentary) matching EXACTLY this shape:
{
  "quorum_met": boolean,
  "minutes_body_html": string, // well-formed statutory HTML: an <h2> heading (per the statutory conventions above), a company/date/venue block, <h3>1. Attendance &amp; Quorum</h3> section listing attendees and a quorum statement, a <h3>2. ...</h3> narrative section (named per the conventions above), a numbered <h3> section per resolution/matter containing its RESOLVED-form text and outcome (labelled per the conventions above), and a final <h3>Action Items</h3> section — unless a HOUSE FORMAT OVERRIDE is specified above, in which case follow that layout for the body instead. Escape any HTML special characters from transcript text.
  "body_confidence": number, // 0-1, your overall confidence in the extraction
  "resolutions": [
    {
      "number": string, // e.g. BD-2025-01 — sequential, prefixed per the numbering convention above, suffixed by meeting year
      "text": string, // statutory form, must start with "RESOLVED that "
      "outcome": "carried" | "deferred" | "lapsed",
      "confidence": number // 0-1
    }
  ],
  "action_items": [
    {
      "description": string,
      "owner": string | null,
      "due_date": string | null, // ISO yyyy-mm-dd, or null if not stated
      "confidence": number // 0-1
    }
  ]
}

Write in formal Malaysian statutory minute drafting style appropriate to this meeting type. Score confidence honestly per item (lower confidence for ambiguous or inferred owners/dates).`;
}

interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * AI provider config — any OpenAI-compatible chat-completions endpoint.
 * Set AI_API_KEY (or legacy OPENAI_API_KEY). To use OpenRouter and switch
 * models freely, set:
 *   AI_API_KEY   = <your OpenRouter key>
 *   AI_BASE_URL  = https://openrouter.ai/api/v1
 *   AI_MODEL     = openai/gpt-4o   (or anthropic/claude-3.5-sonnet, etc.)
 * Defaults target OpenAI directly (base https://api.openai.com/v1, model gpt-4o).
 */
function aiConfig(modelOverride?: string | null): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  // Precedence: the user's in-app choice → env AI_MODEL → default. Lets the
  // model be switched from the Settings page without a Vercel env edit.
  const model = (modelOverride && modelOverride.trim()) || process.env.AI_MODEL || "gpt-4o";
  return { apiKey, baseUrl, model };
}

function hasAiProvider(): boolean {
  return aiConfig() !== null;
}

async function callOpenAiGenerator(
  meeting: Meeting,
  transcriptText: string,
  modelOverride?: string | null,
): Promise<GeneratedMinutes> {
  const cfg = aiConfig(modelOverride);
  if (!cfg) {
    throw new Error("No AI provider configured (set AI_API_KEY or OPENAI_API_KEY)");
  }

  const structuredContext = {
    company_name: meeting.company_name,
    meeting_type: meeting.meeting_type,
    meeting_date: meeting.meeting_date,
    venue: meeting.venue ?? null,
    chairperson: meeting.chairperson ?? null,
    attendees: meeting.attendees ?? [],
    quorum_met_recorded: meeting.quorum_met ?? null,
  };

  const userPrompt = `Meeting metadata (structured context — use this for the company/date/venue block and attendee list; fall back to it only when the transcript doesn't state something explicitly):
${JSON.stringify(structuredContext, null, 2)}

Transcript:
"""
${transcriptText}
"""`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  // OpenRouter recommends (optionally requires) these attribution headers.
  if (cfg.baseUrl.includes("openrouter.ai")) {
    if (process.env.NEXT_PUBLIC_APP_URL) headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_APP_URL;
    headers["X-Title"] = "Meeting Minutes";
  }

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: buildSystemPrompt(meeting) },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`AI request failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as OpenAiChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response had no content");
  }

  const parsed = JSON.parse(content);
  return GeneratedMinutesSchema.parse(parsed);
}

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many generation requests — try again in a minute." },
      { status: 429 },
    );
  }

  try {
    let body: { meetingId?: string; transcriptId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { meetingId, transcriptId } = body;
    if (!meetingId || typeof meetingId !== "string") {
      return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select(
        "id, company_id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status, minutes_format, created_at",
      )
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    let transcript: Transcript | null = null;
    if (transcriptId) {
      const { data, error } = await supabase
        .from("transcripts")
        .select("id, meeting_id, raw_text, source_type, word_count, created_at")
        .eq("id", transcriptId)
        .eq("meeting_id", meetingId)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
      }
      transcript = data as Transcript;
    } else {
      const { data, error } = await supabase
        .from("transcripts")
        .select("id, meeting_id, raw_text, source_type, word_count, created_at")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
      }
      transcript = data as Transcript;
    }

    if (!transcript.raw_text || transcript.raw_text.trim().length === 0) {
      return NextResponse.json({ error: "Transcript is empty" }, { status: 400 });
    }

    const warnings: string[] = [];

    let transcriptText = transcript.raw_text;
    if (transcriptText.length > MAX_TRANSCRIPT_CHARS) {
      transcriptText = transcriptText.slice(0, MAX_TRANSCRIPT_CHARS);
      warnings.push("Transcript truncated before generation");
    }

    const meetingTyped = meeting as Meeting;

    // The generating user's chosen model (Settings page), if any.
    let userModel: string | null = null;
    {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("ai_model")
          .eq("id", authData.user.id)
          .maybeSingle();
        userModel = (prof?.ai_model as string | null) ?? null;
      }
    }

    let generated: GeneratedMinutes;
    let source: "openai_gpt4o" | "rule_based_v1";

    if (hasAiProvider()) {
      try {
        generated = await callOpenAiGenerator(meetingTyped, transcriptText, userModel);
        source = "openai_gpt4o";
      } catch (aiError) {
        console.error("[generate-minutes] OpenAI generation failed, falling back", aiError);
        generated = generateMinutesRuleBased(meetingTyped, transcriptText);
        source = "rule_based_v1";
        warnings.push("AI generation unavailable — used rule-based extraction");
      }
    } else {
      generated = generateMinutesRuleBased(meetingTyped, transcriptText);
      source = "rule_based_v1";
    }

    if (generated.resolutions.length === 0) {
      warnings.push("No resolutions extracted — please review transcript");
    }
    if (generated.action_items.some((item) => !item.owner)) {
      warnings.push("Action item missing owner");
    }

    // Determine next draft version for this meeting.
    const { data: latestDraft } = await supabase
      .from("minutes_drafts")
      .select("version")
      .eq("meeting_id", meetingId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestDraft?.version ?? 0) + 1;

    const { data: insertedDraft, error: insertDraftError } = await supabase
      .from("minutes_drafts")
      .insert({
        meeting_id: meetingId,
        transcript_id: transcript.id,
        body_html: generated.minutes_body_html,
        body_html_source: source,
        body_html_confidence: generated.body_confidence,
        body_html_review_status: "unreviewed",
        status: "draft",
        version: nextVersion,
      })
      .select("id")
      .single();

    if (insertDraftError || !insertedDraft) {
      throw new Error(
        `Failed to insert minutes draft: ${insertDraftError?.message ?? "unknown error"}`,
      );
    }

    const draftId = insertedDraft.id as string;

    // Regeneration semantics: clear out prior auto-generated resolutions and
    // action items for this meeting, preserving anything manually entered.
    await supabase
      .from("resolutions")
      .delete()
      .eq("meeting_id", meetingId)
      .neq("resolution_text_source", "manual");

    await supabase
      .from("action_items")
      .delete()
      .eq("meeting_id", meetingId)
      .neq("description_source", "manual");

    // Keeps track of each inserted resolution's id, in the same order as
    // generated.resolutions, so obligation derivation below can map a
    // resolution_index back to the real resolution id (or null if insertion
    // was skipped/failed for that batch).
    let insertedResolutionIds: (string | null)[] = [];

    if (generated.resolutions.length > 0) {
      const { data: insertedResolutions, error: resolutionsError } = await supabase
        .from("resolutions")
        .insert(
          generated.resolutions.map((r) => ({
            meeting_id: meetingId,
            resolution_number: r.number,
            resolution_text: r.text,
            resolution_text_source: source,
            resolution_text_confidence: r.confidence,
            resolution_text_review_status: "unreviewed",
            outcome: r.outcome,
          })),
        )
        .select("id");
      if (resolutionsError) {
        throw new Error(`Failed to insert resolutions: ${resolutionsError.message}`);
      }
      insertedResolutionIds = (insertedResolutions ?? []).map((r) => (r.id as string) ?? null);
    }

    if (generated.action_items.length > 0) {
      const { error: actionItemsError } = await supabase.from("action_items").insert(
        generated.action_items.map((a) => ({
          meeting_id: meetingId,
          description: a.description,
          description_source: source,
          description_confidence: a.confidence,
          description_review_status: "unreviewed",
          owner_name: a.owner,
          due_date: a.due_date,
          item_status: "open",
        })),
      );
      if (actionItemsError) {
        throw new Error(`Failed to insert action items: ${actionItemsError.message}`);
      }
    }

    // Compute the assurance ("nothing legally required is missing") report
    // for this freshly generated draft and store it. Non-fatal: an assurance
    // failure must never block the minutes generation the user asked for.
    let assuranceScore: number | null = null;
    try {
      // Same company quorum rule the finalisation gate uses. Without it here,
      // the check would report "no rule on record" at generation and then flip
      // when re-run — the number a user sees first must not be one the app
      // already knows is incomplete.
      const companyId = (meeting as { company_id?: string | null }).company_id ?? null;
      const quorum = companyId ? await getQuorumThreshold(companyId) : null;

      const assuranceResult = runAssurance({
        meeting: {
          meeting_type: meetingTyped.meeting_type,
          minutes_format: meetingTyped.minutes_format,
          chairperson: meetingTyped.chairperson,
          attendees: meetingTyped.attendees,
          quorum_met: meetingTyped.quorum_met,
          quorum_rule: quorum
            ? {
                threshold: quorum.threshold,
                total: quorum.total,
                citation: `${quorum.provenance.docTypeLabel} “${quorum.provenance.documentTitle}”, in force ${quorum.provenance.inForceFrom}`,
              }
            : null,
        },
        bodyHtml: generated.minutes_body_html,
        resolutions: generated.resolutions.map((r) => ({
          resolution_number: r.number,
          resolution_text: r.text,
          outcome: r.outcome,
        })),
        actionItems: generated.action_items.map((a) => ({
          description: a.description,
          owner_name: a.owner,
          due_date: a.due_date,
        })),
        transcriptText,
      });

      assuranceScore = assuranceResult.score;

      const { error: assuranceError } = await supabase.from("assurance_reports").insert({
        draft_id: draftId,
        meeting_id: meetingId,
        results: assuranceResult.checks,
        score: assuranceResult.score,
      });

      if (assuranceError) {
        console.error("[generate-minutes] Failed to store assurance report", assuranceError);
      }
    } catch (assuranceErr) {
      console.error("[generate-minutes] Assurance computation failed", assuranceErr);
    }

    // Entity resolution (graph pillar, owned by a parallel workstream) — best
    // effort, never blocks minutes generation.
    try {
      await resolveEntitiesForMeeting(supabase, meetingId);
    } catch (entityErr) {
      console.error("[generate-minutes] Entity resolution failed", entityErr);
    }

    // Obligation derivation (V3 obligation engine): every board decision
    // creates a downstream statutory duty. Regeneration semantics — clear out
    // prior rule-derived obligations for this meeting (source LIKE 'rule:%'),
    // preserving anything manually added, then recompute from the freshly
    // generated draft and insert. Best effort, never blocks generation.
    let obligationCount = 0;
    try {
      const { error: deleteObligationsError } = await supabase
        .from("obligations")
        .delete()
        .eq("meeting_id", meetingId)
        .like("source", "rule:%");
      if (deleteObligationsError) {
        console.error(
          "[generate-minutes] Failed to clear prior rule-derived obligations",
          deleteObligationsError,
        );
      }

      const derivedObligations = deriveObligations({
        meeting: {
          meeting_type: meetingTyped.meeting_type,
          meeting_date: meetingTyped.meeting_date,
          minutes_format: meetingTyped.minutes_format,
        },
        resolutions: generated.resolutions.map((r) => ({
          resolution_number: r.number,
          resolution_text: r.text,
          outcome: r.outcome,
        })),
        actionItems: generated.action_items.map((a) => ({
          description: a.description,
          owner_name: a.owner,
          due_date: a.due_date,
        })),
        transcriptText,
      });

      if (derivedObligations.length > 0) {
        const { error: insertObligationsError } = await supabase.from("obligations").insert(
          derivedObligations.map((o) => ({
            meeting_id: meetingId,
            resolution_id:
              o.resolution_index !== undefined ? insertedResolutionIds[o.resolution_index] ?? null : null,
            kind: o.kind,
            title: o.title,
            detail: o.detail,
            due_date: o.due_date,
            source: o.source,
          })),
        );
        if (insertObligationsError) {
          console.error("[generate-minutes] Failed to insert obligations", insertObligationsError);
        } else {
          obligationCount = derivedObligations.length;
        }
      }
    } catch (obligationErr) {
      console.error("[generate-minutes] Obligation derivation failed", obligationErr);
    }

    await logAudit(supabase, {
      meetingId,
      entityType: "minutes_draft",
      entityId: draftId,
      action: "generate_minutes_draft",
      payload: {
        version: nextVersion,
        source,
        resolution_count: generated.resolutions.length,
        action_item_count: generated.action_items.length,
        warnings,
        assurance_score: assuranceScore,
        obligation_count: obligationCount,
      },
    });

    return NextResponse.json({ draftId, warnings });
  } catch (err) {
    console.error("[generate-minutes] Minutes generation failed", err);
    return NextResponse.json({ error: "Minutes generation failed. Try again." }, { status: 500 });
  }
}
