import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { findSimilarResolutions, type PrecedentMatch } from "@/lib/precedents";
import { formatDate, formatConfidencePercent } from "@/lib/format";
import { Badge, FOCUS_RING } from "@/components/ui";

/**
 * Server component: loads the meeting's current resolutions, finds similar
 * resolutions from OTHER meetings (lib/precedents.ts), and renders a
 * collapsed, muted "Precedents from past minutes" card. Renders nothing
 * (null) when there are no resolutions to match, or no matches are found.
 */
export async function PrecedentPanel({ meetingId }: { meetingId: string }) {
  const supabase = await createClient();

  const { data: meetingRow } = await supabase
    .from("meetings")
    .select("company_id")
    .eq("id", meetingId)
    .maybeSingle();
  const companyId = (meetingRow as { company_id: string | null } | null)?.company_id ?? null;

  const { data: resolutions } = await supabase
    .from("resolutions")
    .select("resolution_text")
    .eq("meeting_id", meetingId);

  const resolutionTexts = (resolutions ?? [])
    .map((r) => (r as { resolution_text: string }).resolution_text)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0);

  if (resolutionTexts.length === 0) return null;

  const matches = await findSimilarResolutions(supabase, meetingId, resolutionTexts, companyId);

  if (matches.length === 0) return null;

  // Same-company precedent first (lib/precedents.ts already sorts this way;
  // re-sorting here keeps the panel correct even if that ordering changes).
  const sortedMatches = [...matches].sort((a, b) => {
    if (a.sameCompany !== b.sameCompany) return a.sameCompany ? -1 : 1;
    return b.similarity - a.similarity;
  });

  return (
    <details className="group rounded-surface border border-dashed border-paper-200 bg-paper-50/60 px-4 py-3 open:pb-4">
      <summary className="cursor-pointer list-none text-body font-medium text-paper-500 select-none">
        <span className="inline-flex items-center gap-2">
          <span className="text-paper-500 transition-transform group-open:rotate-90">›</span>
          Precedents from past minutes
          <span className="text-caption font-normal text-paper-500">({sortedMatches.length})</span>
        </span>
      </summary>

      <ul className="mt-3 space-y-2">
        {sortedMatches.map((match) => (
          <PrecedentMatchRow key={match.resolution_id} match={match} />
        ))}
      </ul>
    </details>
  );
}

function excerpt(text: string, maxLength = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function PrecedentMatchRow({ match }: { match: PrecedentMatch }) {
  return (
    <li className="rounded-surface border border-paper-200 bg-white px-3 py-2 text-caption text-paper-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-paper-600">
          {match.company_name}
          <span className="mx-1 text-paper-300">&middot;</span>
          {formatDate(match.meeting_date)}
          {match.resolution_number ? (
            <>
              <span className="mx-1 text-paper-300">&middot;</span>
              {match.resolution_number}
            </>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5">
          {match.sameCompany ? <Badge variant="indigo">This company</Badge> : null}
          <Badge variant="neutral">{formatConfidencePercent(match.similarity)} similar</Badge>
        </span>
      </div>
      <p className="mt-1 text-paper-500">{excerpt(match.resolution_text)}</p>
      <Link
        href={`/meetings/${match.meeting_id}/draft`}
        className={`mt-1 inline-block rounded-control text-ink-500 hover:text-ink-600 ${FOCUS_RING}`}
      >
        View source meeting →
      </Link>
    </li>
  );
}
