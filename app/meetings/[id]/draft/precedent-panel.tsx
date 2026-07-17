import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { findSimilarResolutions, type PrecedentMatch } from "@/lib/precedents";
import { formatDate, formatConfidencePercent } from "@/lib/format";
import { Badge } from "@/components/ui";

/**
 * NOTE: this component is intentionally NOT mounted anywhere yet — it is
 * exported here for the page orchestrator to wire into
 * app/meetings/[id]/draft/page.tsx once ready.
 *
 * Server component: loads the meeting's current resolutions, finds similar
 * resolutions from OTHER meetings (lib/precedents.ts), and renders a
 * collapsed, muted "Precedents from past minutes" card. Renders nothing
 * (null) when there are no resolutions to match, or no matches are found.
 */
export async function PrecedentPanel({ meetingId }: { meetingId: string }) {
  const supabase = await createClient();

  const { data: resolutions } = await supabase
    .from("resolutions")
    .select("resolution_text")
    .eq("meeting_id", meetingId);

  const resolutionTexts = (resolutions ?? [])
    .map((r) => (r as { resolution_text: string }).resolution_text)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0);

  if (resolutionTexts.length === 0) return null;

  const matches = await findSimilarResolutions(supabase, meetingId, resolutionTexts);

  if (matches.length === 0) return null;

  return (
    <details className="group rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 px-4 py-3 open:pb-4">
      <summary className="cursor-pointer list-none text-sm font-medium text-neutral-500 select-none">
        <span className="inline-flex items-center gap-2">
          <span className="text-neutral-400 transition-transform group-open:rotate-90">›</span>
          Precedents from past minutes
          <span className="text-xs font-normal text-neutral-400">({matches.length})</span>
        </span>
      </summary>

      <ul className="mt-3 space-y-2">
        {matches.map((match) => (
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
    <li className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-neutral-600">
          {match.company_name}
          <span className="mx-1 text-neutral-300">&middot;</span>
          {formatDate(match.meeting_date)}
          {match.resolution_number ? (
            <>
              <span className="mx-1 text-neutral-300">&middot;</span>
              {match.resolution_number}
            </>
          ) : null}
        </span>
        <Badge variant="neutral">{formatConfidencePercent(match.similarity)} similar</Badge>
      </div>
      <p className="mt-1 text-neutral-500">{excerpt(match.resolution_text)}</p>
      <Link
        href={`/meetings/${match.meeting_id}/draft`}
        className="mt-1 inline-block text-indigo-500 hover:text-indigo-600"
      >
        View source meeting →
      </Link>
    </li>
  );
}
