"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssuranceCheck } from "@/lib/assurance";
import { FOCUS_RING } from "@/components/ui";
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

function scoreTextClass(score: number): string {
  if (score >= 85) return "text-emerald-700";
  if (score >= 60) return "text-amber-700";
  return "text-red-700";
}

function scoreRingClass(score: number): string {
  if (score >= 85) return "bg-emerald-50 ring-emerald-200";
  if (score >= 60) return "bg-amber-50 ring-amber-200";
  return "bg-red-50 ring-red-200";
}

// `not_applicable` sits last: it is neither a finding nor an achievement, and
// it must never read as a pass. It is the only status drawn with a DASHED
// border and a "?" glyph, so "nothing was checked here" stays distinguishable
// from "checked and clean" in greyscale, on a printout, and to a colour-blind
// reader — colour alone would not carry it.
const STATUS_ORDER: Record<AssuranceCheck["status"], number> = {
  fail: 0,
  warn: 1,
  not_applicable: 2,
  pass: 3,
};

const STATUS_ICON: Record<AssuranceCheck["status"], string> = {
  fail: "✕",
  warn: "!",
  not_applicable: "?",
  pass: "✓",
};

const STATUS_ICON_CLASS: Record<AssuranceCheck["status"], string> = {
  fail: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  not_applicable: "bg-neutral-100 text-neutral-600",
  pass: "bg-emerald-100 text-emerald-700",
};

const STATUS_BORDER_CLASS: Record<AssuranceCheck["status"], string> = {
  fail: "border-neutral-200 border-l-4 border-l-red-400",
  warn: "border-neutral-200 border-l-4 border-l-amber-400",
  not_applicable: "border-dashed border-neutral-300",
  pass: "border-neutral-200",
};

function hasFail(checks: AssuranceCheck[]): boolean {
  return checks.some((c) => c.status === "fail");
}

function CheckRow({ check }: { check: AssuranceCheck }) {
  return (
    <li className={`flex items-start gap-3 rounded-md border px-3 py-2 ${STATUS_BORDER_CLASS[check.status]}`}>
      <span
        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${STATUS_ICON_CLASS[check.status]}`}
        aria-hidden="true"
      >
        {STATUS_ICON[check.status]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-800">{check.label}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{check.detail}</p>
      </div>
    </li>
  );
}

function AssuranceChecklist({ checks }: { checks: AssuranceCheck[] }) {
  const failWarn = checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const passed = checks.filter((c) => c.status === "pass");
  // Surfaced on its own line rather than folded in with passes: a cosec
  // reading "9 passing checks" must not be counting checks that never ran.
  const notChecked = checks.filter((c) => c.status === "not_applicable");

  return (
    <div className="mt-4 space-y-3">
      {failWarn.length > 0 ? (
        <ul className="space-y-2">
          {failWarn.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </ul>
      ) : notChecked.length > 0 ? (
        <p className="text-sm text-neutral-600">
          No fails or warnings — but {notChecked.length} check
          {notChecked.length === 1 ? " was" : "s were"} not applicable to this meeting. That is
          not the same as a clean record.
        </p>
      ) : (
        <p className="text-sm text-emerald-700">No fails or warnings — all checks passed.</p>
      )}

      {notChecked.length > 0 ? (
        <ul className="space-y-2">
          {notChecked.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </ul>
      ) : null}

      {passed.length > 0 ? (
        <details className="group rounded-md border border-dashed border-neutral-200 bg-neutral-50/60 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-neutral-500 select-none">
            <span className="inline-flex items-center gap-2">
              <span className="text-neutral-400 transition-transform group-open:rotate-90">›</span>
              {passed.length} passing check{passed.length === 1 ? "" : "s"}
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
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          Assurance — will these minutes stand up later?
        </h2>
        {!isFinal ? (
          <button
            type="button"
            onClick={handleRerun}
            disabled={isRerunning}
            className={`inline-flex min-h-11 items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
          >
            {isRerunning ? "Running…" : "Re-run checks"}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}

      {!report ? (
        <p className="mt-4 text-sm text-neutral-500">No assurance report yet.</p>
      ) : (
        <div className="mt-4">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
            <div
              className={`flex h-16 w-16 flex-none items-center justify-center rounded-full text-lg font-bold ring-4 ${scoreRingClass(report.score)} ${scoreTextClass(report.score)}`}
            >
              {Math.round(report.score)}
            </div>
            <div className="text-xs text-neutral-500">
              <p>
                Score out of 100 &mdash; based on {report.results.length} completeness check
                {report.results.length === 1 ? "" : "s"}.
              </p>
              <p className="mt-1">Last run {formatDateTime(report.created_at)}.</p>
            </div>
          </div>

          {report.acknowledged_at ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Risks acknowledged: {report.acknowledged_note} on {formatDate(report.acknowledged_at)}
            </div>
          ) : null}

          <AssuranceChecklist checks={report.results} />

          {!isFinal && hasFail(report.results) && !report.acknowledged_at ? (
            <div className="mt-4">
              {!showAckForm ? (
                <button
                  type="button"
                  onClick={() => setShowAckForm(true)}
                  className={`min-h-11 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 ${FOCUS_RING}`}
                >
                  Acknowledge & proceed
                </button>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <label className="block text-xs font-medium text-amber-800">
                    Note the risk being accepted (required, max 500 characters)
                  </label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, 500))}
                    rows={3}
                    className="mt-1.5 block w-full rounded-md border border-amber-300 bg-white p-2 text-base text-neutral-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
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
                      className={`min-h-11 rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed ${FOCUS_RING}`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAcknowledge}
                      disabled={isAcknowledging || note.trim().length === 0}
                      className={`min-h-11 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
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
