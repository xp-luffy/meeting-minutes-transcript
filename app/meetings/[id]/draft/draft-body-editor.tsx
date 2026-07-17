"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveDraftBody } from "./actions";
import { SaveIndicator, type SaveStatus } from "./save-indicator";

const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * ContentEditable wrapper around the AI-generated body_html. Saves on blur
 * or after a debounced pause in typing, but only when the HTML actually
 * changed since the last successful save. Read-only once the draft is final.
 */
export function DraftBodyEditor({
  draftId,
  meetingId,
  initialHtml,
  isFinal,
}: {
  draftId: string;
  meetingId: string;
  initialHtml: string;
  isFinal: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSavedHtml = useRef(initialHtml);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Set the initial HTML once on mount only — the DOM is mutated directly by
  // the browser while the user types, so we must not let React re-render
  // over it on every keystroke.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  function clearDebounce() {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }

  function save() {
    clearDebounce();
    const current = editorRef.current?.innerHTML ?? "";
    if (current === lastSavedHtml.current) return;

    setStatus("saving");
    setErrorMessage(null);
    startTransition(async () => {
      const result = await saveDraftBody(draftId, meetingId, current);
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        return;
      }
      lastSavedHtml.current = current;
      setStatus("saved");
    });
  }

  function handleInput() {
    if (isFinal) return;
    clearDebounce();
    debounceTimer.current = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleBlur() {
    if (isFinal) return;
    save();
  }

  return (
    <div>
      <div
        ref={editorRef}
        className="minutes-body min-h-[4rem] outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-inset rounded-sm"
        contentEditable={!isFinal}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
      />
      {!isFinal ? (
        <div className="mt-3 flex items-center justify-end">
          <SaveIndicator status={status} errorMessage={errorMessage} />
        </div>
      ) : null}
    </div>
  );
}
