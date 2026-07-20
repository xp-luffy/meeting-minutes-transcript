"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Badge, FOCUS_RING } from "@/components/ui";
import { StatusChip } from "@/components/status";
import { SubmitButton } from "@/components/submit-button";
import {
  CLEAR_OWNER,
  KEEP_TEXT_ONLY,
  candidateAccessibleName,
  candidateEvidence,
  ownerState,
  type OwnerCandidate,
} from "@/lib/owners";
import {
  assignActionItemOwner,
  searchOwnerCandidates,
  type OwnerActionState,
} from "@/app/action-items/owner-actions";

/**
 * The three-state owner display plus the assignment picker.
 *
 * The three states are rendered as TEXT badges, never colour-coded cells, and
 * they are never collapsed into two: "nobody is accountable" and "we cannot
 * prove who is" are different risks and the screen must say which one it is.
 *
 * Nothing here auto-links. An exact, unique name match is pre-highlighted and
 * labelled "suggested — exact name match"; the write only happens when the
 * user submits.
 */

const INITIAL_STATE: OwnerActionState = {};

export interface OwnerCellProps {
  itemId: string;
  meetingId: string;
  ownerName: string | null;
  ownerEntityId: string | null;
  /**
   * Canonical name of the linked person, or null when the link exists but the
   * person is not visible to this user (RLS). A blank cell would read as
   * "unassigned", which is a different and much worse fact — so that case gets
   * its own explicit rendering.
   */
  ownerDisplayName: string | null;
  /** True when the meeting's latest draft is `final`. */
  isFinal?: boolean;
  /** Hide the assign control entirely (read-only surfaces). */
  readOnly?: boolean;
  /**
   * On the draft page the recorded owner text is already rendered next to this
   * cell as an editable field, so repeating it here would just be noise. The
   * "Not linked" / "No owner" badge is still shown — that part is never hidden.
   */
  hideRecordedText?: boolean;
  className?: string;
}

export function OwnerCell({
  itemId,
  meetingId,
  ownerName,
  ownerEntityId,
  ownerDisplayName,
  isFinal = false,
  readOnly = false,
  hideRecordedText = false,
  className = "",
}: OwnerCellProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const state = ownerState(ownerEntityId, ownerName);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={`relative flex flex-wrap items-center gap-2 ${className}`}>
      <OwnerDisplay
        state={state}
        ownerName={ownerName}
        ownerEntityId={ownerEntityId}
        ownerDisplayName={ownerDisplayName}
        hideRecordedText={hideRecordedText}
      />

      {readOnly ? null : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`inline-flex min-h-11 items-center rounded-control border border-paper-450 bg-white px-2.5 text-caption font-medium text-paper-700 hover:border-paper-500 hover:bg-paper-50 sm:min-h-0 sm:py-1 ${FOCUS_RING}`}
        >
          {state === "unassigned" ? "Assign" : state === "text_only" ? "Link" : "Change"}
        </button>
      )}

      {open ? (
        <OwnerPicker
          itemId={itemId}
          meetingId={meetingId}
          ownerName={ownerName}
          isFinal={isFinal}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function OwnerDisplay({
  state,
  ownerName,
  ownerEntityId,
  ownerDisplayName,
  hideRecordedText,
}: {
  state: ReturnType<typeof ownerState>;
  ownerName: string | null;
  ownerEntityId: string | null;
  ownerDisplayName: string | null;
  hideRecordedText: boolean;
}) {
  if (state === "linked") {
    if (!ownerDisplayName) {
      // Linked, but the person row is hidden from this user by RLS. Say so.
      return <StatusChip state="unknown">Owner not visible to you</StatusChip>;
    }
    return (
      <Link
        href={`/people/${ownerEntityId}`}
        className={`inline-flex items-center gap-1 rounded-control text-body text-ink-600 underline decoration-ink-200 underline-offset-2 hover:text-ink-700 hover:decoration-ink-600 ${FOCUS_RING}`}
      >
        <span aria-hidden>&#128100;</span>
        {ownerDisplayName}
      </Link>
    );
  }

  if (state === "text_only") {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {hideRecordedText ? null : (
          <span className="text-body text-paper-700">&ldquo;{ownerName}&rdquo;</span>
        )}
        <StatusChip state="risk">Not linked</StatusChip>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {hideRecordedText ? null : <span className="text-paper-500">&mdash;</span>}
      <StatusChip state="failed">No owner</StatusChip>
    </span>
  );
}

function OwnerPicker({
  itemId,
  meetingId,
  ownerName,
  isFinal,
  onClose,
}: {
  itemId: string;
  meetingId: string;
  ownerName: string | null;
  isFinal: boolean;
  onClose: () => void;
}) {
  const panelId = useId();
  const listId = `${panelId}-list`;
  const [query, setQuery] = useState(ownerName?.trim() ?? "");
  const [candidates, setCandidates] = useState<OwnerCandidate[] | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(KEEP_TEXT_ONLY);
  const [alsoUpdateName, setAlsoUpdateName] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, startSearch] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestedApplied = useRef(false);

  const [state, formAction] = useActionState(assignActionItemOwner, INITIAL_STATE);

  // Close on success. revalidatePath on the server refreshes the row beneath.
  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced candidate load. Errors are stored and rendered, never swallowed.
  useEffect(() => {
    const handle = setTimeout(() => {
      startSearch(async () => {
        const result = await searchOwnerCandidates(meetingId, query);
        if (result.error) {
          setLoadError(result.error);
          setCandidates([]);
          return;
        }
        setLoadError(null);
        setCompanyName(result.companyName);
        setCandidates(result.candidates);

        // Pre-SELECT (never pre-save) a single exact name match at this
        // company. One click still required — see DESIGN_SPEC_V4 §3.2.
        if (!suggestedApplied.current) {
          const exact = result.candidates.filter((c) => c.exact_match && c.at_company);
          if (exact.length === 1) {
            suggestedApplied.current = true;
            setChoice(exact[0].id);
          }
        }
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [meetingId, query, reloadKey]);

  const atCompany = (candidates ?? []).filter((c) => c.at_company);
  const elsewhere = (candidates ?? []).filter((c) => !c.at_company);
  const ordered = [...atCompany, ...elsewhere];
  const selected = ordered.find((c) => c.id === choice) ?? null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (ordered.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(activeIndex + 1, ordered.length - 1);
      setActiveIndex(next);
      setChoice(ordered[next].id);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(activeIndex - 1, 0);
      setActiveIndex(next);
      setChoice(ordered[next].id);
    }
  }

  return (
    <>
      {/* Backdrop: below sm the panel is a bottom sheet, so it needs one. */}
      <div className="fixed inset-0 z-30 bg-paper-900/20 sm:hidden" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Assign owner"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] w-full overflow-y-auto rounded-t-surface border border-paper-300 bg-white p-4 shadow-float sm:absolute sm:inset-x-auto sm:top-full sm:bottom-auto sm:left-0 sm:mt-1 sm:max-h-96 sm:w-96 sm:rounded-surface"
      >
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="choice" value={choice} />
          <input type="hidden" name="candidateName" value={selected?.canonical_name ?? ""} />
          <input type="hidden" name="suggested" value={selected?.exact_match ? "1" : "0"} />

          <label htmlFor={`${panelId}-q`} className="block text-caption font-medium text-paper-600">
            Owner
          </label>
          <input
            id={`${panelId}-q`}
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={activeIndex >= 0 && ordered[activeIndex] ? `${panelId}-opt-${ordered[activeIndex].id}` : undefined}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search people…"
            className="w-full rounded-surface border border-paper-450 px-2.5 py-2 text-base text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
          />

          <div id={listId} role="listbox" aria-label="Matching people" className="space-y-2">
            {candidates === null ? (
              <div className="space-y-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-surface bg-paper-100" />
                ))}
              </div>
            ) : loadError ? (
              <div className="rounded-surface border border-status-failed-600/30 border-l-[3px] border-l-status-failed-600 bg-status-failed-50 p-2 text-caption text-status-failed-800">
                Couldn&apos;t load people.{" "}
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className={`rounded-control font-medium underline ${FOCUS_RING}`}
                >
                  Retry
                </button>
              </div>
            ) : ordered.length === 0 ? (
              <p className="text-caption text-paper-500">
                No one matching &ldquo;{query}&rdquo; at this company or in your workspace.
              </p>
            ) : (
              <>
                {atCompany.length > 0 ? (
                  <CandidateGroup
                    panelId={panelId}
                    label={companyName ? `At ${companyName}` : "At this company"}
                    candidates={atCompany}
                    choice={choice}
                    onChoose={(id) => setChoice(id)}
                  />
                ) : null}
                {elsewhere.length > 0 ? (
                  <CandidateGroup
                    panelId={panelId}
                    label="Elsewhere in your workspace"
                    candidates={elsewhere}
                    choice={choice}
                    onChoose={(id) => setChoice(id)}
                  />
                ) : null}
              </>
            )}
            {isSearching ? (
              <p className="text-caption text-paper-500" aria-live="polite">
                Searching…
              </p>
            ) : null}
          </div>

          <div className="space-y-1 border-t border-paper-200 pt-2">
            <ChoiceRow
              active={choice === KEEP_TEXT_ONLY}
              onClick={() => setChoice(KEEP_TEXT_ONLY)}
              label={
                ownerName?.trim()
                  ? `Keep as text only — “${ownerName.trim()}”`
                  : "Keep as text only (no recorded name)"
              }
            />
            <ChoiceRow
              active={choice === CLEAR_OWNER}
              onClick={() => setChoice(CLEAR_OWNER)}
              label="Clear owner (removes the recorded name)"
              disabled={isFinal}
            />
          </div>

          {selected ? (
            <label className="flex items-start gap-2 text-caption text-paper-600">
              <input
                type="checkbox"
                name="alsoUpdateName"
                checked={alsoUpdateName}
                disabled={isFinal}
                onChange={(event) => setAlsoUpdateName(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                Also update the recorded name to &ldquo;{selected.canonical_name}&rdquo;
                <span className="block text-paper-500">
                  Editing what the minutes say is a document edit — off by default.
                </span>
              </span>
            </label>
          ) : null}

          {isFinal ? (
            <p className="rounded-surface bg-paper-50 p-2 text-caption text-paper-600">
              These minutes are final. The recorded owner text is locked. You can still link it to a
              person for tracking.
            </p>
          ) : null}

          {state.error ? (
            <p role="alert" className="rounded-surface border border-status-failed-200 bg-status-failed-50 p-2 text-caption text-status-failed-700">
              {state.error}
            </p>
          ) : null}

          {/*
            Sticky footer. The popover is capped at sm:max-h-96 and its content
            (search, candidates, three owner options, the rename checkbox and
            its explanation) is taller than that, so "Save owner" opened BELOW
            the popover's own fold — measured at y=770 against a container
            ending at y=739, and elementFromPoint returned <body>, i.e. the
            primary action was not clickable until you scrolled inside the
            popover. Nothing indicated there was more to scroll to.
          */}
          <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center gap-2 border-t border-paper-200 bg-white px-4 py-3">
            <SubmitButton
              pendingLabel="Saving…"
              className={`${FOCUS_RING} inline-flex min-h-11 flex-1 items-center justify-center rounded-control bg-ink-600 px-3.5 text-body font-medium text-white hover:bg-ink-700 active:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Save owner
            </SubmitButton>
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex min-h-11 items-center justify-center rounded-control border border-paper-450 bg-white px-3.5 text-body font-medium text-paper-700 hover:border-paper-500 hover:bg-paper-50 ${FOCUS_RING}`}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {state.message ?? ""}
      </p>
    </>
  );
}

function CandidateGroup({
  panelId,
  label,
  candidates,
  choice,
  onChoose,
}: {
  panelId: string;
  label: string;
  candidates: OwnerCandidate[];
  choice: string;
  onChoose: (id: string) => void;
}) {
  const headingId = `${panelId}-grp-${label.replace(/\W+/g, "-")}`;
  return (
    <div role="group" aria-labelledby={headingId}>
      <p id={headingId} className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-paper-500">
        {label}
      </p>
      {/* presentation roles keep the listbox → group → option chain intact;
          an unroled ul/li between them breaks option semantics. */}
      <ul role="presentation" className="space-y-1">
        {candidates.map((c) => (
          <li role="presentation" key={c.id}>
            <button
              type="button"
              id={`${panelId}-opt-${c.id}`}
              role="option"
              aria-selected={choice === c.id}
              aria-label={candidateAccessibleName(c)}
              onClick={() => onChoose(c.id)}
              className={`flex min-h-11 w-full flex-col items-start rounded-surface px-2 py-1.5 text-left ${FOCUS_RING} ${
                choice === c.id ? "bg-ink-50 ring-1 ring-ink-300" : "hover:bg-paper-50"
              }`}
            >
              <span className="flex w-full flex-wrap items-center gap-2">
                <span className="text-body text-paper-900">{c.canonical_name}</span>
                {c.exact_match ? <Badge variant="ink">suggested — exact name match</Badge> : null}
              </span>
              <span className="text-[11px] text-paper-500">
                {candidateEvidence(c)}
                {c.aliases.length > 0 ? ` · also: ${c.aliases.join(", ")}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChoiceRow({
  active,
  onClick,
  label,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex min-h-11 w-full items-center rounded-surface px-2 text-left text-caption sm:min-h-0 sm:py-1.5 ${FOCUS_RING} ${
        active ? "bg-ink-50 font-medium text-ink-800 ring-1 ring-ink-300" : "text-paper-700 hover:bg-paper-50"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
