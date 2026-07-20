"use client";

import { useState, useTransition, type FormEvent } from "react";
import { confirmSharedDraft } from "../actions";
import { formatDate } from "@/lib/format";
import { FOCUS_RING } from "@/components/ui";

/**
 * "Confirm these minutes" card shown below the read-only shared draft.
 * Anonymous token-holders (e.g. the chairman) can capture their name/role
 * against the draft via the confirm_shared_draft RPC — no sign-in required.
 */
export function ConfirmDraftCard({
  token,
  alreadyConfirmedBy,
}: {
  token: string;
  alreadyConfirmedBy: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ name: string; at: string } | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Enter your full name (at least 2 characters).");
      return;
    }

    startTransition(async () => {
      const result = await confirmSharedDraft(token, trimmedName, role);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmed({ name: trimmedName, at: result.confirmedAt ?? new Date().toISOString() });
    });
  }

  if (confirmed) {
    return (
      <div className="mt-6 rounded-surface border border-status-verified-200 bg-status-verified-50 p-6 text-body shadow-raised">
        <p className="font-medium text-status-verified-800">
          Confirmed by {confirmed.name} on {formatDate(confirmed.at)}.
        </p>
        <p className="mt-1 text-status-verified-700">Thank you — your confirmation has been recorded.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-surface border border-paper-200 bg-white p-4 shadow-raised sm:p-6">
      <h2 className="text-subhead font-semibold text-paper-900">
        {alreadyConfirmedBy.length > 0 ? "Add your confirmation" : "Confirm these minutes"}
      </h2>
      <p className="mt-1 text-body text-paper-500">
        If you attended this meeting, you can confirm this record is accurate.
      </p>
      {alreadyConfirmedBy.length > 0 ? (
        <p className="mt-2 text-caption text-paper-500">
          Already confirmed: {alreadyConfirmedBy.join(", ")}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label htmlFor="confirm-name" className="block text-caption font-medium text-paper-700">
            Full name*
          </label>
          <input
            id="confirm-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
            placeholder="Jane Tan"
            className="mt-1 w-full rounded-surface border border-paper-450 px-3 py-2 text-base sm:text-body text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 disabled:cursor-not-allowed disabled:bg-paper-50"
          />
        </div>
        <div>
          <label htmlFor="confirm-role" className="block text-caption font-medium text-paper-700">
            Role <span className="font-normal text-paper-500">(optional, e.g. Chairman)</span>
          </label>
          <input
            id="confirm-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            disabled={pending}
            placeholder="Chairman"
            className="mt-1 w-full rounded-surface border border-paper-450 px-3 py-2 text-base sm:text-body text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 disabled:cursor-not-allowed disabled:bg-paper-50"
          />
        </div>
        {error ? <p className="text-caption text-status-failed-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className={`inline-flex min-h-11 w-full items-center justify-center rounded-surface bg-ink-600 px-4 py-2.5 text-body font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto sm:py-2 ${FOCUS_RING}`}
        >
          {pending ? "Confirming…" : "I confirm these minutes are accurate"}
        </button>
      </form>
    </div>
  );
}
