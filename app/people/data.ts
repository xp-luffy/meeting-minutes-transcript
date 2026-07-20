import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

/**
 * Data layer for the people/entity pages and the local ego-graph. Reads
 * `entities` (graph nodes) and `entity_links` (graph edges) directly — RLS
 * (see supabase/migrations/0009_graph_obligation_engine.sql) scopes every
 * row to what the session user can see, same pattern as lib/companies.ts:
 * plain selects, bulk-fetched child rows (no N+1), aggregated in JS.
 */

export type EntityKind = "person" | "org";

export interface EntityRow {
  id: string;
  kind: EntityKind;
  canonical_name: string;
  normalized_name: string;
  aliases: string[];
  reg_no: string | null;
}

function toAliasArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** Human label for an entity_links relation, e.g. "shareholder" -> "Shareholder". */
export function relationLabel(relation: string): string {
  const LABELS: Record<string, string> = {
    attended: "Attended",
    chaired: "Chairman",
    director: "Director",
    chairman: "Chairman",
    secretary: "Secretary",
    shareholder: "Shareholder",
    member: "Member",
    owner: "Owner",
    associated: "Associated",
  };
  return LABELS[relation] ?? (relation.charAt(0).toUpperCase() + relation.slice(1));
}

export interface PersonListItem {
  id: string;
  canonical_name: string;
  aliases: string[];
  aliasCount: number;
  meetingCount: number;
  companyCount: number;
}

/**
 * Person entities visible to the session user, optionally filtered by a
 * substring match on canonical_name or any alias (case-insensitive, applied
 * in JS since aliases live in a jsonb array). Connection counts (# meetings
 * attended, # companies linked) come from one bulk entity_links query keyed
 * on all matching entity ids — never one query per person.
 */
const PEOPLE_PAGE_LIMIT = 200;

export async function getPeopleList(query: string): Promise<PersonListItem[]> {
  const supabase = await createClient();
  const needle = query.trim().toLowerCase();

  // Push the name search into the query (trigram-indexed ILIKE) and bound the
  // page — at portfolio scale loading every entity + all its edges to count
  // connections in JS doesn't scale (docs/SIM_REPORT_V3.md). Alias-only matches
  // beyond the name match are a documented v1 gap.
  let listQuery = supabase
    .from("entities")
    .select("id, canonical_name, aliases")
    .eq("kind", "person")
    .order("canonical_name", { ascending: true })
    .limit(PEOPLE_PAGE_LIMIT);
  if (needle) {
    listQuery = listQuery.ilike("canonical_name", `%${needle.replace(/[%_]/g, (m) => `\\${m}`)}%`);
  }
  const { data, error } = await listQuery;

  if (error || !data) return [];

  type Row = { id: string; canonical_name: string; aliases: unknown };
  let rows = data as Row[];

  if (needle) {
    // Keep alias-substring matches that also landed in the page.
    rows = rows.filter((r) => {
      if (r.canonical_name.toLowerCase().includes(needle)) return true;
      return toAliasArray(r.aliases).some((a) => a.toLowerCase().includes(needle));
    });
  }

  const ids = rows.map((r) => r.id);
  const countsByEntity = new Map<string, { meetingCount: number; companyCount: number }>();
  for (const id of ids) countsByEntity.set(id, { meetingCount: 0, companyCount: 0 });

  if (ids.length > 0) {
    const { data: linksData, error: linksError } = await supabase
      .from("entity_links")
      .select("entity_id, target_type, target_id")
      .in("entity_id", ids)
      .in("target_type", ["meeting", "company"]);

    if (!linksError && linksData) {
      const seen = new Set<string>();
      for (const link of linksData as { entity_id: string; target_type: string; target_id: string }[]) {
        const dedupeKey = `${link.entity_id}:${link.target_type}:${link.target_id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const entry = countsByEntity.get(link.entity_id);
        if (!entry) continue;
        if (link.target_type === "meeting") entry.meetingCount += 1;
        else if (link.target_type === "company") entry.companyCount += 1;
      }
    }
  }

  return rows.map((r) => {
    const aliases = toAliasArray(r.aliases);
    const counts = countsByEntity.get(r.id) ?? { meetingCount: 0, companyCount: 0 };
    return {
      id: r.id,
      canonical_name: r.canonical_name,
      aliases,
      aliasCount: aliases.length,
      meetingCount: counts.meetingCount,
      companyCount: counts.companyCount,
    };
  });
}

/** A single entity (person or org) by id, or null if it doesn't exist / RLS hides it. */
export async function getEntity(id: string): Promise<EntityRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entities")
    .select("id, kind, canonical_name, normalized_name, aliases, reg_no")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    kind: string;
    canonical_name: string;
    normalized_name: string;
    aliases: unknown;
    reg_no: string | null;
  };

  return {
    id: row.id,
    kind: row.kind === "org" ? "org" : "person",
    canonical_name: row.canonical_name,
    normalized_name: row.normalized_name,
    aliases: toAliasArray(row.aliases),
    reg_no: row.reg_no,
  };
}

/**
 * Best-effort match from an org entity to its `companies` row (by reg_no,
 * falling back to a case-insensitive exact name match) — org entities and
 * companies are separate tables (the entity is a graph node mirroring the
 * company), so there's no foreign key between them. Returns null if nothing
 * matches, so the caller can fall back gracefully instead of crashing.
 */
export async function findCompanyIdForOrgEntity(entity: EntityRow): Promise<string | null> {
  if (entity.kind !== "org") return null;
  const supabase = await createClient();

  if (entity.reg_no) {
    const { data } = await supabase
      .from("companies")
      .select("id")
      .eq("reg_no", entity.reg_no)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  // Escape LIKE wildcards — a company literally named "%" or "A_B" must match
  // itself, not act as a wildcard against other accessible companies (audit P2).
  const escaped = entity.canonical_name.replace(/[\\%_]/g, (m) => `\\${m}`);
  const { data } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", escaped)
    .limit(1)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

export interface PersonMeetingRow {
  id: string;
  company_name: string;
  meeting_type: string;
  meeting_date: string;
  status: string;
  relation: string;
}

export interface PersonCompanyRoleRow {
  id: string;
  name: string;
  reg_no: string | null;
  relation: string;
}

export interface PersonActionItemRow {
  id: string;
  description: string;
  due_date: string | null;
  meeting_id: string;
}

export interface EgoNode {
  id: string;
  label: string;
  kind: "person" | "org" | "meeting";
  relation?: string;
}

export interface EgoEdge {
  from: string;
  to: string;
  relation: string;
}

export interface PersonDetail {
  meetings: PersonMeetingRow[];
  companyRoles: PersonCompanyRoleRow[];
  openActions: PersonActionItemRow[];
  egoNodes: EgoNode[];
  egoEdges: EgoEdge[];
  overflowCount: number;
}

const EMPTY_PERSON_DETAIL: PersonDetail = {
  meetings: [],
  companyRoles: [],
  openActions: [],
  egoNodes: [],
  egoEdges: [],
  overflowCount: 0,
};

const MAX_EGO_NODES = 24;

/**
 * The full ego-graph view for one person entity: meetings attended/chaired,
 * company roles held, open action items owned, and the node/edge arrays for
 * <EgoGraph/>. One entity_links select for this entity, then bulk selects
 * for the referenced meetings/companies/action_items (no N+1).
 */
export async function getPersonDetail(entity: EntityRow): Promise<PersonDetail> {
  const supabase = await createClient();

  const { data: linksData, error: linksError } = await supabase
    .from("entity_links")
    .select("target_type, target_id, relation")
    .eq("entity_id", entity.id)
    .in("target_type", ["meeting", "company", "action_item"]);

  if (linksError || !linksData) return EMPTY_PERSON_DETAIL;

  const links = linksData as { target_type: string; target_id: string; relation: string }[];
  const meetingLinks = links.filter((l) => l.target_type === "meeting");
  const companyLinks = links.filter((l) => l.target_type === "company");
  const actionLinks = links.filter((l) => l.target_type === "action_item");

  const meetingIds = Array.from(new Set(meetingLinks.map((l) => l.target_id)));
  const companyIds = Array.from(new Set(companyLinks.map((l) => l.target_id)));
  const actionIds = Array.from(new Set(actionLinks.map((l) => l.target_id)));

  type MeetingRow = { id: string; company_name: string; meeting_type: string; meeting_date: string; status: string };
  type CompanyRow = { id: string; name: string; reg_no: string | null };
  type ActionRow = { id: string; description: string; due_date: string | null; meeting_id: string; item_status: string };

  const [meetingsResult, companiesResult, actionsResult] = await Promise.all([
    meetingIds.length > 0
      ? supabase.from("meetings").select("id, company_name, meeting_type, meeting_date, status").in("id", meetingIds)
      : Promise.resolve({ data: [] as MeetingRow[], error: null }),
    companyIds.length > 0
      ? supabase.from("companies").select("id, name, reg_no").in("id", companyIds)
      : Promise.resolve({ data: [] as CompanyRow[], error: null }),
    actionIds.length > 0
      ? supabase
          .from("action_items")
          .select("id, description, due_date, meeting_id, item_status")
          .in("id", actionIds)
          .eq("item_status", "open")
      : Promise.resolve({ data: [] as ActionRow[], error: null }),
  ]);

  const meetingsById = new Map<string, MeetingRow>();
  for (const m of (meetingsResult.data ?? []) as MeetingRow[]) meetingsById.set(m.id, m);

  const companiesById = new Map<string, CompanyRow>();
  for (const c of (companiesResult.data ?? []) as CompanyRow[]) companiesById.set(c.id, c);

  const actionsById = new Map<string, ActionRow>();
  for (const a of (actionsResult.data ?? []) as ActionRow[]) actionsById.set(a.id, a);

  // One relation per meeting/company — prefer "chaired" over "attended" if both appear.
  const relationByMeeting = new Map<string, string>();
  for (const l of meetingLinks) {
    const prev = relationByMeeting.get(l.target_id);
    if (!prev || (prev === "attended" && l.relation === "chaired")) {
      relationByMeeting.set(l.target_id, l.relation);
    }
  }
  const relationByCompany = new Map<string, string>();
  for (const l of companyLinks) {
    if (!relationByCompany.has(l.target_id)) relationByCompany.set(l.target_id, l.relation);
  }

  const meetings: PersonMeetingRow[] = meetingIds
    .map((id) => {
      const m = meetingsById.get(id);
      if (!m) return null;
      return {
        id: m.id,
        company_name: m.company_name,
        meeting_type: m.meeting_type,
        meeting_date: m.meeting_date,
        status: m.status,
        relation: relationByMeeting.get(id) ?? "attended",
      };
    })
    .filter((row): row is PersonMeetingRow => row !== null)
    .sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : -1));

  const companyRoles: PersonCompanyRoleRow[] = companyIds
    .map((id) => {
      const c = companiesById.get(id);
      if (!c) return null;
      return { id: c.id, name: c.name, reg_no: c.reg_no, relation: relationByCompany.get(id) ?? "associated" };
    })
    .filter((row): row is PersonCompanyRoleRow => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const openActions: PersonActionItemRow[] = actionIds
    .map((id) => actionsById.get(id))
    .filter((a): a is ActionRow => Boolean(a))
    .map((a) => ({ id: a.id, description: a.description, due_date: a.due_date, meeting_id: a.meeting_id }))
    .sort((a, b) => (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99"));

  // Ego nodes: company roles first (fewer, high-signal), then meetings — capped.
  const allCandidates: EgoNode[] = [
    ...companyRoles.map((c) => ({ id: c.id, label: c.name, kind: "org" as const, relation: c.relation })),
    ...meetings.map((m) => ({
      id: m.id,
      label: `${m.meeting_type} · ${formatDate(m.meeting_date)}`,
      kind: "meeting" as const,
      relation: m.relation,
    })),
  ];

  const egoNodes = allCandidates.slice(0, MAX_EGO_NODES);
  const egoEdges: EgoEdge[] = egoNodes.map((n) => ({
    from: entity.id,
    to: n.id,
    relation: n.relation ?? "associated",
  }));

  return {
    meetings,
    companyRoles,
    openActions,
    egoNodes,
    egoEdges,
    overflowCount: Math.max(0, allCandidates.length - egoNodes.length),
  };
}

// ---------------------------------------------------------------------------
// "Owes, grouped by company" — the cross-company obligation view (V4 §3.5)
// ---------------------------------------------------------------------------

export interface OwedItem {
  id: string;
  description: string;
  due_date: string | null;
  meeting_id: string;
  item_status: "open" | "done";
  isOverdue: boolean;
}

export interface OwedCompanyGroup {
  companyName: string;
  items: OwedItem[];
  openCount: number;
  overdueCount: number;
}

export interface PersonOwes {
  groups: OwedCompanyGroup[];
  completed: OwedItem[];
  /** Exact totals from COUNT queries — true even when the item list is capped. */
  openTotal: number;
  overdueTotal: number;
  /** True when the item list hit its cap, so the groups below are incomplete. */
  truncated: boolean;
  /** True when the underlying reads failed; the page must not render "0 owed". */
  failed: boolean;
}

/** Generous cap. The filter IS `owner_entity_id = this person`, so the limit
 *  trims an already-correct set rather than slicing an unfiltered table — and
 *  when it bites we say so instead of silently showing a partial account. */
const OWES_LIMIT = 400;

export async function getPersonOwes(entityId: string): Promise<PersonOwes> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [itemsResult, openCountResult, overdueCountResult] = await Promise.all([
    supabase
      .from("action_items")
      .select("id, description, due_date, meeting_id, item_status")
      .eq("owner_entity_id", entityId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(OWES_LIMIT),
    supabase
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("owner_entity_id", entityId)
      .eq("item_status", "open"),
    supabase
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("owner_entity_id", entityId)
      .eq("item_status", "open")
      .lt("due_date", today),
  ]);

  const empty: PersonOwes = {
    groups: [],
    completed: [],
    openTotal: 0,
    overdueTotal: 0,
    truncated: false,
    failed: true,
  };

  if (itemsResult.error || openCountResult.error || overdueCountResult.error) {
    return empty;
  }

  type Row = {
    id: string;
    description: string;
    due_date: string | null;
    meeting_id: string;
    item_status: "open" | "done";
  };
  const rows = (itemsResult.data ?? []) as Row[];

  const meetingIds = Array.from(new Set(rows.map((r) => r.meeting_id)));
  const companyByMeeting = new Map<string, string>();
  if (meetingIds.length > 0) {
    const { data: meetingRows, error: meetingError } = await supabase
      .from("meetings")
      .select("id, company_name")
      .in("id", meetingIds);
    if (meetingError) return empty;
    for (const m of (meetingRows ?? []) as { id: string; company_name: string }[]) {
      companyByMeeting.set(m.id, m.company_name);
    }
  }

  const grouped = new Map<string, OwedItem[]>();
  const completed: OwedItem[] = [];

  for (const r of rows) {
    const item: OwedItem = {
      id: r.id,
      description: r.description,
      due_date: r.due_date,
      meeting_id: r.meeting_id,
      item_status: r.item_status,
      isOverdue: r.item_status === "open" && r.due_date !== null && r.due_date < today,
    };
    if (r.item_status === "done") {
      completed.push(item);
      continue;
    }
    // A meeting the caller cannot read is named explicitly, never silently
    // folded into another company's group.
    const company = companyByMeeting.get(r.meeting_id) ?? "Company not visible to you";
    const bucket = grouped.get(company);
    if (bucket) bucket.push(item);
    else grouped.set(company, [item]);
  }

  const groups: OwedCompanyGroup[] = Array.from(grouped.entries())
    .map(([companyName, items]) => ({
      companyName,
      items,
      openCount: items.length,
      overdueCount: items.filter((i) => i.isOverdue).length,
    }))
    // Most overdue first — the point of the screen is what is late.
    .sort((a, b) => b.overdueCount - a.overdueCount || b.openCount - a.openCount || a.companyName.localeCompare(b.companyName));

  return {
    groups,
    completed,
    openTotal: openCountResult.count ?? 0,
    overdueTotal: overdueCountResult.count ?? 0,
    truncated: rows.length === OWES_LIMIT,
    failed: false,
  };
}

export interface UnlinkedNameMatch {
  id: string;
  description: string;
  owner_name: string;
  meeting_id: string;
  company_name: string | null;
  item_status: string;
}

export interface UnlinkedMatches {
  sample: UnlinkedNameMatch[];
  total: number;
  /**
   * True when the detection could not run. The banner then says
   * "Could not check for unlinked items naming this person" — the absence of a
   * detected match is NOT proof there isn't one, and a person page that looks
   * complete when it isn't is the failure this whole banner exists to prevent.
   */
  failed: boolean;
}

/**
 * Action items that RECORD an owner name resembling this person but are not
 * linked to them. Runs entirely in SQL (`unlinked_owner_matches`, migration
 * 0017) with a window COUNT, so the number is right even when the sample is
 * capped — doing it in JS over a LIMITed page would UNDER-report the gap.
 */
export async function getUnlinkedOwnerMatches(entityId: string): Promise<UnlinkedMatches> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unlinked_owner_matches", {
    p_entity_id: entityId,
    p_limit: 25,
  });

  if (error) return { sample: [], total: 0, failed: true };

  type Row = {
    id: string;
    description: string;
    owner_name: string;
    meeting_id: string;
    company_name: string | null;
    item_status: string;
    total_count: number | string;
  };
  const rows = (data ?? []) as Row[];

  return {
    sample: rows.map((r) => ({
      id: r.id,
      description: r.description,
      owner_name: r.owner_name,
      meeting_id: r.meeting_id,
      company_name: r.company_name,
      item_status: r.item_status,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) || rows.length : 0,
    failed: false,
  };
}

export interface CompanyPersonRow {
  id: string;
  name: string;
  relation: string;
}

/**
 * Person entities linked to a company (entity_links target_type='company'),
 * with their relation (Director/Chairman/etc) — used by the "People &
 * directors" section on the company detail page and its ego graph. One
 * entity_links select scoped to the company, then one entities select for
 * the referenced person ids.
 */
export async function getCompanyPeople(companyId: string): Promise<CompanyPersonRow[]> {
  const supabase = await createClient();

  const { data: linksData, error: linksError } = await supabase
    .from("entity_links")
    .select("entity_id, relation")
    .eq("target_type", "company")
    .eq("target_id", companyId);

  if (linksError || !linksData) return [];

  const links = linksData as { entity_id: string; relation: string }[];
  const entityIds = Array.from(new Set(links.map((l) => l.entity_id)));
  if (entityIds.length === 0) return [];

  const { data: entitiesData, error: entitiesError } = await supabase
    .from("entities")
    .select("id, canonical_name")
    .in("id", entityIds)
    .eq("kind", "person");

  if (entitiesError || !entitiesData) return [];

  const nameById = new Map(
    (entitiesData as { id: string; canonical_name: string }[]).map((e) => [e.id, e.canonical_name]),
  );

  const relationByEntity = new Map<string, string>();
  for (const l of links) {
    if (!relationByEntity.has(l.entity_id)) relationByEntity.set(l.entity_id, l.relation);
  }

  return entityIds
    .filter((id) => nameById.has(id))
    .map((id) => ({ id, name: nameById.get(id) as string, relation: relationByEntity.get(id) ?? "associated" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
