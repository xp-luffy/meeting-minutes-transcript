import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { sanitizeMinutesHtml } from "@/lib/sanitize-html";
import { Badge } from "@/components/ui";
import { ConfirmDraftCard } from "./confirm-draft-card";

// get_shared_draft (0006_insights_v2.sql) now also returns
// already_confirmed_by — the RPC's generated Supabase types haven't caught
// up, so the row shape is typed locally here.
type SharedDraftRow = {
  company_name: string;
  meeting_type: string;
  meeting_date: string;
  venue: string | null;
  body_html: string | null;
  body_html_source: string | null;
  status: string;
  version: number;
  expires_at: string;
  already_confirmed_by: string[] | null;
};

// Token-gated read-only draft view (send_draft_for_review). The token is the
// credential: lookup happens via the get_shared_draft security-definer RPC.
export default async function SharedReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_draft", {
    share_token: token,
  });

  const draft = (Array.isArray(data) ? data[0] : data) as SharedDraftRow | null;
  if (error || !draft) notFound();

  const alreadyConfirmedBy = draft.already_confirmed_by ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6 rounded-surface border border-status-risk-200 bg-status-risk-50 px-4 py-3 text-body text-status-risk-800">
        Shared for review — read-only. This link expires{" "}
        {formatDate(draft.expires_at)}.
      </div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-page font-semibold text-balance break-words text-paper-900 [hyphens:auto]">
            {draft.company_name}
          </h1>
          <p className="mt-1 text-body text-paper-600">
            {draft.meeting_type} · {formatDate(draft.meeting_date)}
            {draft.venue ? ` · ${draft.venue}` : ""}
          </p>
        </div>
        <Badge variant="neutral" className="shrink-0">
          Draft v{draft.version} · {draft.status}
        </Badge>
      </div>
      <div className="rounded-surface border border-paper-300 bg-white p-4 sm:p-6">
        {draft.body_html_source === "legacy_md" ? (
          <pre className="whitespace-pre-wrap font-sans text-body text-paper-800">
            {draft.body_html}
          </pre>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="minutes-body"
              dangerouslySetInnerHTML={{ __html: sanitizeMinutesHtml(draft.body_html ?? "") }}
            />
          </div>
        )}
      </div>

      <ConfirmDraftCard token={token} alreadyConfirmedBy={alreadyConfirmedBy} />

      <p className="mt-6 text-center text-caption text-paper-600">
        Generated with Meeting Minutes — statutory minutes from transcripts.
      </p>
    </main>
  );
}
