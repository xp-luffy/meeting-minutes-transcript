"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { saveDraftBody } from "./actions";
import { SaveIndicator, type SaveStatus } from "./save-indicator";

const AUTOSAVE_DEBOUNCE_MS = 1500;

type ToolbarButtonProps = {
  label: string;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
};

function ToolbarButton({ label, onClick, isActive, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      className={`rounded-sm px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        isActive
          ? "bg-indigo-100 text-indigo-700"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      {label}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-1 sticky top-0 z-10">
      <ToolbarButton
        label="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
      />
      <ToolbarButton
        label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
      />
      <span className="mx-1 h-4 w-px bg-neutral-300" aria-hidden="true" />
      <ToolbarButton
        label="H2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
      />
      <ToolbarButton
        label="H3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
      />
      <span className="mx-1 h-4 w-px bg-neutral-300" aria-hidden="true" />
      <ToolbarButton
        label="• List"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
      />
      <ToolbarButton
        label="1. List"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
      />
      <span className="mx-1 h-4 w-px bg-neutral-300" aria-hidden="true" />
      <ToolbarButton
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      />
      <ToolbarButton
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      />
    </div>
  );
}

/**
 * Tiptap-based rich text editor for the AI-generated body_html. Saves on blur
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
  const lastSavedHtml = useRef(initialHtml);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function clearDebounce() {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }

  function save(editor: Editor) {
    clearDebounce();
    const current = editor.getHTML();
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

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml,
    editable: !isFinal,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "minutes-body min-h-[4rem] rounded-sm focus:ring-2 focus:ring-indigo-200 focus:ring-inset",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      if (isFinal) return;
      clearDebounce();
      debounceTimer.current = setTimeout(() => save(updatedEditor), AUTOSAVE_DEBOUNCE_MS);
    },
    onBlur: ({ editor: blurredEditor }) => {
      if (isFinal) return;
      save(blurredEditor);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Keep the editable state in sync if isFinal changes without remounting.
  useEffect(() => {
    if (editor && editor.isEditable !== !isFinal) {
      editor.setEditable(!isFinal);
    }
  }, [editor, isFinal]);

  // Reset the "last saved" baseline whenever we swap to a different draft.
  useEffect(() => {
    lastSavedHtml.current = initialHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Flush any pending debounced save on unmount.
  useEffect(() => {
    return () => clearDebounce();
  }, []);

  if (!editor) {
    return <div className="minutes-body min-h-[4rem] rounded-sm" />;
  }

  return (
    <div>
      {!isFinal ? <EditorToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
      {!isFinal ? (
        <div className="mt-3 flex items-center justify-end">
          <SaveIndicator status={status} errorMessage={errorMessage} />
        </div>
      ) : null}
    </div>
  );
}
