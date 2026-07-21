"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Resolution } from "@/lib/types";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/types";
import { Badge, FOCUS_RING, OutcomePill } from "@/components/ui";
import { acceptResolutionText, updateResolutionField } from "./actions";
import { SaveIndicator, type SaveStatus } from "./save-indicator";

const OUTCOMES = ["carried", "deferred", "lapsed"] as const;

/** Editable card for a single resolution: number, text, outcome, and the accept-low-confidence flow. */
export function ResolutionCard({
  resolution,
  meetingId,
  isFinal,
}: {
  resolution: Resolution;
  meetingId: string;
  isFinal: boolean;
}) {
  const [resolutionNumber, setResolutionNumber] = useState(resolution.resolution_number ?? "");
  const [resolutionText, setResolutionText] = useState(resolution.resolution_text);
  const [outcome, setOutcome] = useState(resolution.outcome);
  const [reviewStatus, setReviewStatus] = useState(resolution.resolution_text_review_status);

  const lastSaved = useRef({
    resolution_number: resolution.resolution_number ?? "",
    resolution_text: resolution.resolution_text,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAccepting, startAcceptTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [resolutionText]);

  const lowConfidence =
    resolution.resolution_text_confidence !== null &&
    resolution.resolution_text_confidence !== undefined &&
    resolution.resolution_text_confidence < CONFIDENCE_REVIEW_THRESHOLD;
  const showAmber = lowConfidence && reviewStatus === "unreviewed";

  function saveField(field: "resolution_text" | "resolution_number" | "outcome", value: string) {
    setStatus("saving");
    setErrorMessage(null);
    startSaveTransition(async () => {
      const result = await updateResolutionField(resolution.id, meetingId, field, value);
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }
      if (field === "resolution_text" || field === "resolution_number") {
        lastSaved.current[field] = value;
      }
      setStatus("saved");
    });
  }

  function handleNumberBlur() {
    if (isFinal) return;
    if (resolutionNumber === lastSaved.current.resolution_number) return;
    saveField("resolution_number", resolutionNumber);
  }

  function handleTextBlur() {
    if (isFinal) return;
    if (resolutionText === lastSaved.current.resolution_text) return;
    if (resolutionText.trim().length === 0) {
      setStatus("error");
      setErrorMessage("Resolution text cannot be empty.");
      return;
    }
    saveField("resolution_text", resolutionText);
  }

  function handleOutcomeChange(value: string) {
    if (isFinal) return;
    setOutcome(value as Resolution["outcome"]);
    saveField("outcome", value);
  }

  function handleAccept() {
    if (isFinal) return;
    startAcceptTransition(async () => {
      const result = await acceptResolutionText(resolution.id, meetingId);
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }
      setReviewStatus("approved");
    });
  }

  return (
    <li
      className={`rounded-surface border bg-white p-4 ${
        showAmber ? "border-paper-300 border-l-4 border-l-status-risk-400" : "border-paper-300"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            value={resolutionNumber}
            onChange={(event) => setResolutionNumber(event.target.value)}
            onBlur={handleNumberBlur}
            disabled={isFinal}
            placeholder="—"
            className="w-full min-w-0 rounded-surface border border-paper-450 px-2 py-1.5 text-base font-semibold text-paper-900 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0 sm:w-32 sm:py-1 sm:text-body"
          />
          {isFinal ? (
            <OutcomePill outcome={outcome} />
          ) : (
            <select
              value={outcome}
              onChange={(event) => handleOutcomeChange(event.target.value)}
              disabled={isFinal}
              className="w-full rounded-surface border border-paper-450 px-2 py-1.5 text-base font-medium capitalize text-paper-700 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 disabled:cursor-not-allowed sm:w-auto sm:py-1 sm:text-caption"
            >
              {OUTCOMES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          )}
          {showAmber ? <Badge variant="amber">Low confidence — review</Badge> : null}
        </div>
        {showAmber && !isFinal ? (
          <button
            type="button"
            onClick={handleAccept}
            disabled={isAccepting}
            className={`inline-flex min-h-11 items-center justify-center rounded-surface border border-status-risk-300 bg-status-risk-50 px-3 py-1 text-caption font-medium text-status-risk-800 hover:bg-status-risk-100 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            {isAccepting ? "Accepting…" : "Accept"}
          </button>
        ) : null}
      </div>

      <textarea
        ref={textareaRef}
        value={resolutionText}
        onChange={(event) => setResolutionText(event.target.value)}
        onBlur={handleTextBlur}
        disabled={isFinal}
        rows={2}
        className="mt-2 block w-full resize-none rounded-surface border-0 p-0 text-base leading-relaxed text-paper-700 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-paper-700 sm:text-body"
      />

      {!isFinal ? (
        <div className="mt-2 flex items-center justify-end">
          <SaveIndicator status={isSaving ? "saving" : status} errorMessage={errorMessage} />
        </div>
      ) : null}
    </li>
  );
}
