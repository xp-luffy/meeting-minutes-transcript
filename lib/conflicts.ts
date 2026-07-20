import type { SupabaseClient } from "@supabase/supabase-js";
import { nameSimilarity } from "./entities";

/**
 * Graph-powered conflict / related-party detection.
 *
 * Reads the directorship graph seeded in `entity_links` (a person entity
 * linked to a company with relation director/chairman/shareholder) and cross-
 * references it against the counterparties named in a meeting's resolutions.
 * The flagship finding: a resolution deals with a company that one of the
 * attendees privately directs, and no interest declaration is on the record.
 *
 * This module talks to Supabase, so it is NOT framework-free — it is verified
 * by typecheck + live pilot, not the scratchpad unit tests. It never throws:
 * any failure resolves to NULL, meaning "the scan did not run".
 *
 * Do not "simplify" a failure back to `[]`. An empty array is rendered as a
 * green all-clear asserting no conflicts exist; returning it on error means a
 * database problem produces a positive legal assurance. That bug shipped, and
 * the first attempt to fix it only handled the catch block — postgrest-js
 * resolves errors instead of throwing, so every query must check `error`.
 */

export type ConflictSeverity = "warn" | "flag";

export interface ConflictFinding {
  severity: ConflictSeverity;
  title: string;
  detail: string;
  relatedEntity?: string;
  relatedCompany?: string;
}

// Relations that constitute a private interest worth flagging.
const INTEREST_RELATIONS = ["director", "chairman", "shareholder"] as const;

// "declaration of interest" recorded anywhere in the minutes body/transcript.
const INTEREST_DECLARATION_RE = /declar\w+\s+(?:of\s+)?interest|interest.{0,20}declar/i;

// A resolution that is itself a related-party transaction / mandate.
const RRPT_RE = /related.?part(?:y|ies)|\bRRPT\b|recurrent related|shareholders'? mandate/i;

// Org-name suffixes used to pull candidate company phrases out of free text.
const ORG_SUFFIX_RE =
  /\b([A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,5}\s+(?:Bhd|Berhad|Sdn(?:\s+Bhd)?|Ltd|Limited|Inc|Incorporated|Corp|Corporation|LLP|LLC|PLC|Group|Holdings|Ventures|Capital|Marine|Resources|Trading|Enterprise))\b/g;

const MAX_COMPANIES = 200;
const MAX_RESOLUTIONS = 100;
const MIN_SUBSTRING_LEN = 4;
const SIMILARITY_THRESHOLD = 0.7;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract candidate organisation phrases (capitalised runs ending in an org suffix). */
function extractOrgCandidates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ORG_SUFFIX_RE)) out.push(m[1]);
  return out;
}

/**
 * Does `resolutionText` reference `companyName`? True on a normalized substring
 * hit, or when any org-suffix phrase in the text is ≥0.7 similar to the name.
 */
function resolutionMentionsCompany(
  resolutionText: string,
  candidates: string[],
  companyName: string,
): boolean {
  const normName = normalize(companyName);
  if (normName.length < MIN_SUBSTRING_LEN) return false;
  if (normalize(resolutionText).includes(normName)) return true;
  for (const candidate of candidates) {
    if (nameSimilarity(candidate, companyName) >= SIMILARITY_THRESHOLD) return true;
  }
  return false;
}

function relationLabel(relation: string): string {
  const map: Record<string, string> = {
    director: "Director",
    chairman: "Chairman",
    shareholder: "Shareholder",
  };
  return map[relation] ?? relation;
}

interface DirectorshipEdge {
  entity_id: string;
  target_id: string; // companies.id
  relation: string;
}

/**
 * Detect conflicts of interest for a meeting by traversing the directorship
 * graph.
 *
 * Returns `null` when the scan could not be completed, which the caller MUST
 * render differently from an empty list. It previously returned `[]` on any
 * error, and the panel renders an empty list as a green tick reading "No
 * conflicts or contradictions detected across the record" — so a dropped
 * connection or an RLS denial produced a positive legal assurance that nobody
 * had actually checked anything. "We could not check" and "there is nothing to
 * find" are opposite claims and must never share a rendering.
 */
export async function detectConflicts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  meetingId: string,
): Promise<ConflictFinding[] | null> {
  try {
    // --- meeting (own company is excluded as a counterparty) ---------------
    // Every query below destructures `error` and returns null on it.
    //
    // Returning null from the catch block alone was NOT enough: postgrest-js
    // does not throw on a query error, it resolves to { data: null, error }.
    // So an RLS denial or a dropped connection fell through to a `return []`,
    // which the panel renders as a green "No conflicts or contradictions
    // detected across the record" — a positive legal assurance produced by a
    // failure. The catch only ever caught genuine JS exceptions.
    //
    // `[]` from here on means "the scan ran and found nothing". Null means
    // "the scan did not run". They must never be conflated again.
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, company_id, company_name")
      .eq("id", meetingId)
      .maybeSingle();
    if (meetingError) return null;
    if (!meeting) return [];

    const ownCompanyId: string | null = meeting.company_id ?? null;
    const ownCompanyNorm = normalize(meeting.company_name ?? "");

    // --- attendee entities (nodes present in this meeting) -----------------
    const { data: attLinks, error: attLinksError } = await supabase
      .from("entity_links")
      .select("entity_id")
      .eq("target_type", "meeting")
      .eq("target_id", meetingId);
    if (attLinksError) return null;

    const attendeeEntityIds = [...new Set((attLinks ?? []).map((l) => l.entity_id as string))];
    if (attendeeEntityIds.length === 0) return [];

    // attendee display names
    const { data: attEntities, error: attEntitiesError } = await supabase
      .from("entities")
      .select("id, canonical_name")
      .in("id", attendeeEntityIds);
    if (attEntitiesError) return null;
    const nameByEntityId = new Map<string, string>(
      (attEntities ?? []).map((e) => [e.id as string, (e.canonical_name as string) ?? "An attendee"]),
    );

    // --- directorship edges for those attendees ----------------------------
    const { data: dirLinksRaw, error: dirLinksError } = await supabase
      .from("entity_links")
      .select("entity_id, target_id, relation")
      .eq("target_type", "company")
      .in("entity_id", attendeeEntityIds)
      .in("relation", INTEREST_RELATIONS as unknown as string[]);
    if (dirLinksError) return null;
    const dirLinks = (dirLinksRaw ?? []) as DirectorshipEdge[];
    if (dirLinks.length === 0) return [];

    // company ids the attendees have an interest in
    const interestCompanyIds = new Set(dirLinks.map((l) => l.target_id));

    // --- candidate counterparty companies in scope -------------------------
    // Scope the fetch to the companies an attendee actually directs (already
    // known). A bare limit(N) here was a CORRECTNESS bug: past N companies for
    // a firm, the implicated counterparty could fall outside the slice and the
    // conflict would silently go undetected (docs/SIM_REPORT_V3.md).
    const interestCompanyIdList = Array.from(interestCompanyIds).slice(0, MAX_COMPANIES);
    const { data: companies, error: companiesError } =
      interestCompanyIdList.length > 0
        ? await supabase.from("companies").select("id, name").in("id", interestCompanyIdList)
        : { data: [] as { id: string; name: string }[], error: null };
    if (companiesError) return null;
    // Never flag the meeting's own company.
    const counterpartyCompanies = (companies ?? []).filter(
      (c) =>
        c.id !== ownCompanyId &&
        normalize((c.name as string) ?? "") !== ownCompanyNorm,
    );
    if (counterpartyCompanies.length === 0) return [];

    // --- resolutions -------------------------------------------------------
    const { data: resolutions, error: resolutionsError } = await supabase
      .from("resolutions")
      .select("id, resolution_number, resolution_text")
      .eq("meeting_id", meetingId)
      .limit(MAX_RESOLUTIONS);
    if (resolutionsError) return null;
    if (!resolutions || resolutions.length === 0) return [];

    // --- interest-declaration presence ------------------------------------
    // These two reads are EVIDENCE for the finding "no interest declaration was
    // found". If either fails, the haystack is empty and every conflict is
    // reported as undeclared — a failed lookup dressed up as an evidentiary
    // conclusion about a director's conduct. Bail instead.
    const { data: draft, error: draftError } = await supabase
      .from("minutes_drafts")
      .select("body_html, version")
      .eq("meeting_id", meetingId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (draftError) return null;
    const { data: transcript, error: transcriptError } = await supabase
      .from("transcripts")
      .select("raw_text")
      .eq("meeting_id", meetingId)
      .limit(1)
      .maybeSingle();
    if (transcriptError) return null;
    // The minutes and the transcript are NOT interchangeable evidence here.
    //
    // These used to be concatenated into one haystack, so a declaration spoken
    // in the room but never written into the minutes downgraded the finding
    // from `flag` to `warn`. That is backwards: the minutes are the statutory
    // record, and a declaration that exists only in the transcript is exactly
    // the omission this product exists to catch. It must escalate, not soften.
    const declaredInMinutes = INTEREST_DECLARATION_RE.test(
      stripHtml((draft?.body_html as string) ?? ""),
    );
    const declaredInTranscriptOnly =
      !declaredInMinutes &&
      INTEREST_DECLARATION_RE.test((transcript?.raw_text as string) ?? "");

    // --- traverse: resolution counterparty × attendee directorship ---------
    // Dedupe per (attendee, counterparty); collect the resolutions involved.
    const findings = new Map<
      string,
      {
        entityId: string;
        company: { id: string; name: string };
        relation: string;
        resolutionNumbers: string[];
        rrpt: boolean;
      }
    >();

    for (const res of resolutions) {
      const text = (res.resolution_text as string) ?? "";
      if (!text.trim()) continue;
      const candidates = extractOrgCandidates(text);
      const isRrpt = RRPT_RE.test(text);

      for (const company of counterpartyCompanies) {
        const companyName = (company.name as string) ?? "";
        if (!resolutionMentionsCompany(text, candidates, companyName)) continue;

        // which attendees direct this counterparty?
        for (const edge of dirLinks) {
          if (edge.target_id !== company.id) continue;
          const key = `${edge.entity_id}::${company.id}`;
          const resLabel =
            (res.resolution_number as string) || `"${text.slice(0, 32).trim()}…"`;
          const existing = findings.get(key);
          if (existing) {
            if (!existing.resolutionNumbers.includes(resLabel)) {
              existing.resolutionNumbers.push(resLabel);
            }
            existing.rrpt = existing.rrpt || isRrpt;
          } else {
            findings.set(key, {
              entityId: edge.entity_id,
              company: { id: company.id as string, name: companyName },
              relation: edge.relation,
              resolutionNumbers: [resLabel],
              rrpt: isRrpt,
            });
          }
        }
      }
    }

    // --- render findings ---------------------------------------------------
    const out: ConflictFinding[] = [];
    for (const f of findings.values()) {
      const person = nameByEntityId.get(f.entityId) ?? "An attendee";
      const rel = relationLabel(f.relation);
      const resList = f.resolutionNumbers.join(", ");
      const rrptClause = f.rrpt
        ? " This resolution is a related-party transaction, so the interest is directly material."
        : "";
      const declClause = declaredInMinutes
        ? " An interest declaration is recorded in the minutes — confirm it covers this person and counterparty."
        : declaredInTranscriptOnly
          ? " An interest declaration appears in the transcript but NOT in the minutes — the statutory record does not show it."
          : " No interest declaration was found in the minutes or the transcript.";

      out.push({
        // Only a declaration in the MINUTES softens this to a warning.
        severity: declaredInMinutes ? "warn" : "flag",
        title: `Possible undeclared interest: ${person} is ${f.relation} of ${f.company.name}`,
        detail: `${person} (${rel}, ${f.company.name}) is a party to ${resList}, where ${f.company.name} is the counterparty.${rrptClause}${declClause}`,
        relatedEntity: person,
        relatedCompany: f.company.name,
      });
    }

    // flag-severity first, then warn
    out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "flag" ? -1 : 1));
    return out;
  } catch (error) {
    // Null, not [] — see the doc comment. An unchecked record must not be
    // presented to a cosec as a clean one.
    console.error("detectConflicts failed:", error);
    return null;
  }
}
