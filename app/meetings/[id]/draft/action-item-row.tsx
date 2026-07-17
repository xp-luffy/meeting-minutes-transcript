"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionItem } from "@/lib/types";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/types";
import { Badge, ItemStatusPill } from "@/components/ui";
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
}: {
  item: ActionItem;
  meetingId: string;
  isFinal: boolean;
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
    <li className={`flex flex-wrap items-start justify-between gap-3 p-4 ${showAmber ? "bg-amber-50/50" : ""}`}>
      <div className="min-w-0 flex-1">
        <textarea
          ref={textareaRef}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={handleDescriptionBlur}
          disabled={isFinal}
          rows={1}
          className="block w-full resize-none rounded-md border-0 p-0 text-sm text-neutral-800 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-neutral-800"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <input
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
            onBlur={handleOwnerBlur}
            disabled={isFinal}
            placeholder="Owner"
            className="w-28 rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0"
          />
          {!ownerName && !isFinal ? <Badge variant="amber">No owner</Badge> : null}
          <span>Due</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => handleDueDateChange(event.target.value)}
            disabled={isFinal}
            className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0"
          />
          {showAmber ? <Badge variant="amber">Low confidence</Badge> : null}
          {!isFinal ? <SaveIndicator status={isSaving ? "saving" : status} errorMessage={errorMessage} /> : null}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        {showAmber && !isFinal ? (
          <button
            type="button"
            onClick={handleAccept}
            disabled={isAccepting}
            className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ItemStatusPill status={itemStatus} />
          </button>
        )}
      </div>
    </li>
  );
}
