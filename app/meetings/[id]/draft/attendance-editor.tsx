"use client";

import { useState, useTransition } from "react";
import type { Attendee } from "@/lib/types";
import { FOCUS_RING } from "@/components/ui";
import { saveAttendance } from "./actions";
import { SaveIndicator, type SaveStatus } from "./save-indicator";

/**
 * Collapsible "Attendance & Quorum" section: editable name/role pairs for
 * meeting.attendees plus the quorum_met checkbox. Saves explicitly via a
 * "Save attendance" button (not per-keystroke). Locked once the draft is
 * final, matching the other editors on this page.
 */
export function AttendanceEditor({
  meetingId,
  initialAttendees,
  initialQuorumMet,
  isFinal,
}: {
  meetingId: string;
  initialAttendees: Attendee[];
  initialQuorumMet: boolean | null;
  isFinal: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [attendees, setAttendees] = useState<Attendee[]>(
    initialAttendees.length > 0 ? initialAttendees : [{ name: "", role: "" }],
  );
  const [quorumMet, setQuorumMet] = useState(initialQuorumMet ?? false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  function updateAttendee(index: number, field: "name" | "role", value: string) {
    if (isFinal) return;
    setStatus("idle");
    setAttendees((prev) =>
      prev.map((attendee, i) => (i === index ? { ...attendee, [field]: value } : attendee)),
    );
  }

  function removeAttendee(index: number) {
    if (isFinal) return;
    setStatus("idle");
    setAttendees((prev) => prev.filter((_, i) => i !== index));
  }

  function addAttendee() {
    if (isFinal) return;
    setStatus("idle");
    setAttendees((prev) => [...prev, { name: "", role: "" }]);
  }

  function handleSave() {
    if (isFinal) return;
    setStatus("saving");
    setErrorMessage(null);
    startSaveTransition(async () => {
      const result = await saveAttendance(meetingId, attendees, quorumMet);
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }
      setStatus("saved");
    });
  }

  return (
    <div className="rounded-surface border border-paper-300 bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between rounded-t-lg px-6 py-4 text-left ${FOCUS_RING}`}
      >
        <h2 className="text-subhead font-medium text-paper-700">Attendance &amp; Quorum</h2>
        <span className="text-caption text-paper-600">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="border-t border-paper-300 px-6 py-4">
          <ul className="space-y-3 sm:space-y-2">
            {attendees.map((attendee, index) => (
              <li key={index} className="flex items-center gap-2">
                <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                  <input
                    value={attendee.name}
                    onChange={(event) => updateAttendee(index, "name", event.target.value)}
                    disabled={isFinal}
                    placeholder="Name"
                    className="flex-1 rounded-surface border border-paper-450 px-2 py-1.5 text-base text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 disabled:cursor-not-allowed disabled:bg-paper-50 sm:text-body"
                  />
                  <input
                    value={attendee.role}
                    onChange={(event) => updateAttendee(index, "role", event.target.value)}
                    disabled={isFinal}
                    placeholder="Role"
                    className="rounded-surface border border-paper-450 px-2 py-1.5 text-base text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 disabled:cursor-not-allowed disabled:bg-paper-50 sm:w-40 sm:text-body"
                  />
                </div>
                {!isFinal ? (
                  <button
                    type="button"
                    onClick={() => removeAttendee(index)}
                    aria-label="Remove attendee"
                    className={`inline-flex min-h-11 min-w-11 flex-none items-center justify-center rounded-surface text-body font-medium text-paper-600 hover:bg-status-failed-50 hover:text-status-failed-600 ${FOCUS_RING}`}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {!isFinal ? (
            <button
              type="button"
              onClick={addAttendee}
              className={`mt-3 inline-flex min-h-11 items-center rounded-surface border border-paper-450 bg-white px-3 py-1.5 text-caption font-medium text-paper-700 hover:bg-paper-50 sm:min-h-0 ${FOCUS_RING}`}
            >
              + Add attendee
            </button>
          ) : null}

          <div className="mt-4 flex items-center gap-2 border-t border-paper-100 pt-4">
            <input
              id={`quorum-met-${meetingId}`}
              type="checkbox"
              checked={quorumMet}
              onChange={(event) => {
                if (isFinal) return;
                setStatus("idle");
                setQuorumMet(event.target.checked);
              }}
              disabled={isFinal}
              className="h-4 w-4 rounded border-paper-300 text-ink-600 focus:ring-ink-500 disabled:cursor-not-allowed"
            />
            <label htmlFor={`quorum-met-${meetingId}`} className="text-body text-paper-700">
              Quorum met
            </label>
          </div>

          {!isFinal ? (
            <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
              <SaveIndicator status={isSaving ? "saving" : status} errorMessage={errorMessage} />
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className={`inline-flex min-h-11 items-center justify-center rounded-surface bg-ink-600 px-3 py-1.5 text-caption font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
              >
                {isSaving ? "Saving…" : "Save attendance"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
