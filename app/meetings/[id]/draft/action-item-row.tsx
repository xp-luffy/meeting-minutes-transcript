"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionItem } from "@/lib/types";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/types";
import { Badge, FOCUS_RING, ItemStatusPill } from "@/components/ui";
import { OwnerCell } from "@/components/owner-picker";
import {
  acceptActionItemDescription,
  toggleActionItemStatus,
  updateActionItemField,
} from "./actions";
import { SaveIndicator, type SaveStatus } from "./save-indicator";

/** Editable row for a single action item: description, owner, due date, and open/done toggle. */
export function ActionItemRow({
  item,
  meetingId,
  isFinal,
  ownerDisplayName = null,
}: {
  item: ActionItem;
  meetingId: string;
  isFinal: boolean;
  /** Canonical name of the linked person, or null when unlinked/not visible. */
  ownerDisplayName?: string | null;
}) {
  const [description, setDescription] = useState(item.description);
  const [ownerName, setOwnerName] = useState(item.owner_name ?? "");
  const [dueDate, setDueDate] = useState(item.due_date ?? "");
  const [itemStatus, setItemStatus] = useState(item.item_status);
  const [reviewStatus, setReviewStatus] = useState(item.description_review_status);

  const lastSaved = useRef({
    description: item.description,
    owner_name: item.owner_name ?? "",
    due_date: item.due_date ?? "",
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isToggling, startToggleTransition] = useTransition();
  const [isAccepting, startAcceptTransition] = useTransition();

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [description]);

  const lowConfidence =
    item.description_confidence !== null &&
    item.description_confidence !== undefined &&
    item.description_confidence < CONFIDENCE_REVIEW_THRESHOLD;
  const showAmber = lowConfidence && reviewStatus === "unreviewed";

  function saveField(field: "description" | "owner_name" | "due_date", value: string) {
    setStatus("saving");
    setErrorMessage(null);
    startSaveTransition(async () => {
      const result = await updateActionItemField(item.id, meetingId, field, value);
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }
      lastSaved.current[field] = value;
      setStatus("saved");
    });
  }

  function handleDescriptionBlur() {
    if (isFinal) return;
    if (description === lastSaved.current.description) return;
    if (description.trim().length === 0) {
      setStatus("error");
      setErrorMessage("Description cannot be empty.");
      return;
    }
    saveField("description", description);
  }

  function handleOwnerBlur() {
    if (isFinal) return;
    if (ownerName === lastSaved.current.owner_name) return;
    saveField("owner_name", ownerName);
  }

  function handleDueDateChange(value: string) {
    if (isFinal) return;
    setDueDate(value);
    if (value === lastSaved.current.due_date) return;
    saveField("due_date", value);
  }

  function handleToggle() {
    if (isFinal) return;
    startToggleTransition(async () => {
      const result = await toggleActionItemStatus(item.id, meetingId, itemStatus);
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }
      setItemStatus((prev) => (prev === "open" ? "done" : "open"));
    });
  }

  function handleAccept() {
    if (isFinal) return;
    startAcceptTransition(async () => {
      const result = await acceptActionItemDescription(item.id, meetingId);
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
      className={`flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between ${showAmber ? "bg-status-risk-50/50" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <textarea
          ref={textareaRef}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={handleDescriptionBlur}
          disabled={isFinal}
          rows={1}
          className="block w-full resize-none rounded-surface border-0 p-0 text-base leading-relaxed text-paper-800 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-paper-800 sm:text-body"
        />
        <div className="mt-2 flex flex-col gap-2 text-caption text-paper-600 sm:mt-1 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Two distinct things, deliberately side by side: the RECORDED text
              (what the minutes say — a document field) and the LINK to a real
              person (an overlay on the record, never a rewrite of it). */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`owner-${item.id}`}>
              Recorded owner as written in the minutes
            </label>
            <input
              id={`owner-${item.id}`}
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              onBlur={handleOwnerBlur}
              disabled={isFinal}
              placeholder="Owner as recorded"
              className="w-full rounded-surface border border-paper-450 px-2 py-1 text-base text-paper-700 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0 sm:w-32 sm:py-0.5 sm:text-caption"
            />
            <OwnerCell
              itemId={item.id}
              meetingId={meetingId}
              ownerName={ownerName || null}
              ownerEntityId={item.owner_entity_id ?? null}
              ownerDisplayName={ownerDisplayName}
              isFinal={isFinal}
              hideRecordedText
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Due</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => handleDueDateChange(event.target.value)}
              disabled={isFinal}
              className="rounded-surface border border-paper-450 px-2 py-1 text-base text-paper-700 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0 sm:py-0.5 sm:text-caption"
            />
            {showAmber ? <Badge variant="amber">Low confidence</Badge> : null}
          </div>
          {!isFinal ? <SaveIndicator status={isSaving ? "saving" : status} errorMessage={errorMessage} /> : null}
        </div>
      </div>
      <div className="flex items-center gap-2 self-start sm:flex-col sm:items-end">
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
        {isFinal ? (
          <ItemStatusPill status={itemStatus} />
        ) : (
          <button
            type="button"
            onClick={handleToggle}
            disabled={isToggling}
            className={`inline-flex min-h-11 items-center rounded-surface px-1 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <ItemStatusPill status={itemStatus} />
          </button>
        )}
      </div>
    </li>
  );
}
