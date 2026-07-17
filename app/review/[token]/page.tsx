import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

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

  const draft = Array.isArray(data) ? data[0] : data;
  if (error || !draft) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Shared for review — read-only. This link expires{" "}
        {formatDate(draft.expires_at)}.
      </div>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            {draft.company_name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {draft.meeting_type} · {formatDate(draft.meeting_date)}
            {draft.venue ? ` · ${draft.venue}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
          Draft v{draft.version} · {draft.status}
        </span>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        {draft.body_html_source === "legacy_md" ? (
          <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-800">
            {draft.body_html}
          </pre>
        ) : (
          <div
            className="minutes-body"
            dangerouslySetInnerHTML={{ __html: draft.body_html ?? "" }}
          />
        )}
      </div>
      <p className="mt-6 text-center text-xs text-neutral-400">
        Generated with Meeting Minutes — statutory minutes from transcripts.
      </p>
    </main>
  );
}
