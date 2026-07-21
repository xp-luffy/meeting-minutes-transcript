"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssuranceCheck } from "@/lib/assurance";
import { FOCUS_RING } from "@/components/ui";
import { StatusBanner, StatusGlyph, StatusRow, type StatusState } from "@/components/status";
import { formatDate, formatDateTime } from "@/lib/format";
import { acknowledgeAssurance, rerunAssurance } from "./actions";

/**
 * Client component: renders the assurance ("nothing legally required is
 * missing") report for the current draft — a score dial, the checklist
 * grouped fail → warn → pass (pass collapsed), a re-run control, and an
 * acknowledge-the-risk flow that unblocks Mark Final when fail-level gaps
 * remain open.
 */

export interface AssuranceReport {
  id: string;
  results: AssuranceCheck[];
  score: number;
  acknowledged_at: string | null;
  acknowledged_note: string | null;
  created_at: string;
}

/**
 * Score dial colours. Only ever rendered when EVERY check ran — see
 * `unknownCount` below, which suppresses the dial entirely otherwise.
 */
function scoreTextClass(score: number): string {
  if (score >= 85) return "text-status-verified-800";
  if (score >= 60) return "text-status-risk-800";
  return "text-status-failed-800";
}

function scoreRingClass(score: number): string {
  if (score >= 85) return "bg-status-verified-50 ring-status-verified-600";
  if (score >= 60) return "bg-status-risk-50 ring-status-risk-600";
  return "bg-status-failed-50 ring-status-failed-600";
}

/**
 * The four AssuranceStatus values map onto the four states of the visual
 * status language. `not_applicable` is UNKNOWN — a check that did not run is
 * not an achievement and must never render adjacent to a pass.
 */
const CHECK_STATE: Record<AssuranceCheck["status"], StatusState> = {
  fail: "failed",
  warn: "risk",
  not_applicable: "unknown",
  pass: "verified",
};

/** The word each check states, in words, next to its label. */
const CHECK_WORD: Record<AssuranceCheck["status"], string> = {
  fail: "FAILED",
  warn: "REVIEW",
  not_applicable: "NOT CHECKED",
  pass: "VERIFIED",
};

// failed -> unknown -> risk -> verified. UNKNOWN sorts ABOVE risk: an unrun
// check is a larger liability than a flagged-but-passing one.
const CHECK_SORT: Record<AssuranceCheck["status"], number> = {
  fail: 0,
  not_applicable: 1,
  warn: 2,
  pass: 3,
};

function hasFail(checks: AssuranceCheck[]): boolean {
  return checks.some((c) => c.status === "fail");
}

function CheckRow({ check }: { check: AssuranceCheck }) {
  return (
    <StatusRow
      state={CHECK_STATE[check.status]}
      stateWord={CHECK_WORD[check.status]}
      label={check.label}
      detail={check.detail}
    />
  );
}

function AssuranceChecklist({ checks }: { checks: AssuranceCheck[] }) {
  // One list, ordered failed → NOT CHECKED → review → verified. An unrun check
  // outranks a flagged-but-passing one, because it is the larger liability:
  // "we looked and it needs judgement" is strictly better than "we never
  // looked". Never folded in with the passes.
  const findings = checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => CHECK_SORT[a.status] - CHECK_SORT[b.status]);
  const passed = checks.filter((c) => c.status === "pass");
  const notChecked = checks.filter((c) => c.status === "not_applicable");
  const hasFindings = checks.some((c) => c.status === "fail" || c.status === "warn");

  return (
    <div className="mt-4 space-y-3">
      {!hasFindings && notChecked.length > 0 ? (
        <p className="text-body text-paper-700">
          No fails or warnings &mdash; but {notChecked.length} check
          {notChecked.length === 1 ? " was" : "s were"} not applicable to this meeting. That is not
          the same as a clean record.
        </p>
      ) : null}

      {findings.length > 0 ? (
        <ul className="space-y-2">
          {findings.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-status-verified-800">
          No fails or warnings &mdash; all {passed.length} check
          {passed.length === 1 ? "" : "s"} verified.
        </p>
      )}

      {passed.length > 0 ? (
        <details className="group rounded-surface border border-paper-300 bg-paper-50 px-3 py-2">
          {/* The denominator stays on screen: "N of M verified", never a bare
              count of passes with the total hidden behind the disclosure. */}
          <summary className="cursor-pointer list-none text-caption font-medium text-paper-600 select-none">
            <span className="inline-flex items-center gap-2">
              <span className="text-paper-600 transition-transform group-open:rotate-90">
                &rsaquo;
              </span>
              {passed.length} of {checks.length} checks verified
            </span>
          </summary>
          <ul className="mt-2 space-y-2">
            {passed.map((check) => (
              <CheckRow key={check.key} check={check} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function AssurancePanel({
  report,
  meetingId,
  draftId,
  isFinal,
}: {
  report: AssuranceReport | null;
  meetingId: string;
  draftId: string;
  isFinal: boolean;
}) {
  const router = useRouter();
  const [isRerunning, startRerunTransition] = useTransition();
  const [isAcknowledging, startAckTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAckForm, setShowAckForm] = useState(false);
  const [note, setNote] = useState("");

  // Any check that did not run makes the aggregate score a false precision.
  const unknownCount = (report?.results ?? []).filter(
    (c) => c.status === "not_applicable",
  ).length;

  function handleRerun() {
    setError(null);
    startRerunTransition(async () => {
      const result = await rerunAssurance(draftId, meetingId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleAcknowledge() {
    if (!report) return;
    setError(null);
    startAckTransition(async () => {
      const result = await acknowledgeAssurance(report.id, meetingId, note);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowAckForm(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-surface border border-paper-300 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* A panel title owns its card, so it is a subhead — not the eyebrow
            caps that made the type scale run backwards at the top end. */}
        <h2 className="text-subhead font-semibold text-paper-700">
          Assurance — will these minutes stand up later?
        </h2>
        {!isFinal ? (
          <button
            type="button"
            onClick={handleRerun}
            disabled={isRerunning}
            className={`inline-flex min-h-11 items-center rounded-surface border border-paper-450 bg-white px-3 py-1.5 text-caption font-medium text-paper-700 hover:bg-paper-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
          >
            {isRerunning ? "Running…" : "Re-run checks"}
          </button>
        ) : null}
      </div>

      {error ? <p role="alert" className="mt-2 text-meta font-medium text-status-failed-700">{error}</p> : null}

      {!report ? (
        /*
         * The not-run state used to be `text-sm text-neutral-500` — the same
         * muted grey as incidental metadata, and QUIETER than a bad score,
         * which got a 64px dial. The state that should stop a cosec cold was
         * the least visible thing on the panel. It is now the UNKNOWN banner.
         */
        <StatusBanner
          state="unknown"
          className="mt-4"
          title="These minutes have not been checked"
          action={
            !isFinal ? (
              <button
                type="button"
                onClick={handleRerun}
                disabled={isRerunning}
                className={`inline-flex min-h-11 items-center rounded-control bg-ink-600 px-3.5 py-2 text-body font-medium text-white hover:bg-ink-700 active:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
              >
                {isRerunning ? "Running…" : "Run assurance checks"}
              </button>
            ) : null
          }
        >
          No assurance report has been generated for this draft. Nothing here has been verified
          against statutory requirements.
        </StatusBanner>
      ) : (
        <div className="mt-4">
          {unknownCount > 0 ? (
            <StatusBanner
              state="unknown"
              className="mb-4"
              title={`${unknownCount} of ${report.results.length} checks could not be run`}
            >
              The score below is withheld. A number computed over checks that did not all run is a
              false precision, and reading it as a grade is how an unverified gap reaches a signed
              document.
            </StatusBanner>
          ) : null}

          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
            {unknownCount > 0 ? (
              /* Score SUPPRESSED, not recoloured. See the banner above. */
              <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full border border-dashed border-status-unknown-600 text-body font-semibold text-status-unknown-800">
                — / 100
              </div>
            ) : (
              <div
                className={`flex h-16 w-16 flex-none items-center justify-center rounded-full text-title font-bold ring-4 ${scoreRingClass(report.score)} ${scoreTextClass(report.score)}`}
              >
                {Math.round(report.score)}
              </div>
            )}
            <div className="text-meta text-paper-600">
              <p>
                {unknownCount > 0 ? (
                  <>
                    <span className="font-medium">— / 100 · incomplete</span> &mdash; based on{" "}
                    {report.results.length} completeness check
                    {report.results.length === 1 ? "" : "s"}, of which {unknownCount} did not run.
                  </>
                ) : (
                  <>
                    Score out of 100 &mdash; based on {report.results.length} completeness check
                    {report.results.length === 1 ? "" : "s"}.
                  </>
                )}
              </p>
              <p className="mt-1">Last run {formatDateTime(report.created_at)}.</p>
            </div>
          </div>

          {report.acknowledged_at ? (
            <div className="mt-4 rounded-surface border border-status-risk-200 bg-status-risk-50 px-3 py-2 text-caption text-status-risk-800">
              Risks acknowledged: {report.acknowledged_note} on {formatDate(report.acknowledged_at)}
            </div>
          ) : null}

          <AssuranceChecklist checks={report.results} />

          {!isFinal && hasFail(report.results) && !report.acknowledged_at ? (
            <div className="mt-4">
              {!showAckForm ? (
                /*
                 * Secondary button with a risk rail and a `!` glyph — NOT a
                 * solid amber button. Accepting a known statutory gap must not
                 * be styled as the happy path.
                 */
                <button
                  type="button"
                  onClick={() => setShowAckForm(true)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-control border border-paper-450 border-l-[3px] border-l-status-risk-600 bg-white px-3.5 py-2 text-body font-medium text-paper-700 hover:bg-paper-50 hover:border-paper-500 ${FOCUS_RING}`}
                >
                  <StatusGlyph state="risk" className="h-4 w-4 text-status-risk-700" />
                  Acknowledge &amp; proceed
                </button>
              ) : (
                <div className="rounded-surface border border-status-risk-200 bg-status-risk-50 p-3">
                  <label className="block text-caption font-medium text-status-risk-800">
                    Note the risk being accepted (required, max 500 characters)
                  </label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, 500))}
                    rows={3}
                    className="mt-1.5 block w-full rounded-surface border border-status-risk-300 bg-white p-2 text-base text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
                    placeholder="e.g. Quorum wording will be fixed before circulation, but proceeding to unblock signature."
                  />
                  <div className="mt-2 flex flex-col-reverse items-stretch justify-end gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAckForm(false);
                        setNote("");
                      }}
                      disabled={isAcknowledging}
                      className={`min-h-11 rounded-surface px-2.5 py-1 text-caption font-medium text-paper-600 hover:bg-paper-100 disabled:cursor-not-allowed ${FOCUS_RING}`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAcknowledge}
                      disabled={isAcknowledging || note.trim().length === 0}
                      className={`min-h-11 rounded-surface bg-status-risk-700 px-3.5 py-2 text-body font-medium text-white hover:bg-status-risk-800 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
                    >
                      {isAcknowledging ? "Saving…" : "Confirm acknowledgement"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
