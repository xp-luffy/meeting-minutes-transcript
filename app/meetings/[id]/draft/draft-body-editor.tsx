"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { saveDraftBody } from "./actions";
import { SaveIndicator, type SaveStatus } from "./save-indicator";

const AUTOSAVE_DEBOUNCE_MS = 1500;

const TABLES_DISABLED_MESSAGE =
  "This draft's layout isn't editable here yet — edits are disabled to protect the tables.";

/**
 * Cheap structural check for table markup. Used as a safety net: if the
 * source HTML has a table but the editor's parsed/serialized HTML doesn't,
 * something (missing node extensions, a lossy transform, etc.) dropped it,
 * and we must not let that loss get persisted.
 */
function hasTableMarkup(html: string): boolean {
  return html.toLowerCase().includes("<table");
}

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
      className={`inline-flex flex-none min-h-11 min-w-11 items-center justify-center sm:min-h-0 sm:min-w-0 rounded-sm px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 ${
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
    <div className="sticky top-0 z-10 mb-2 flex flex-nowrap items-center gap-1 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-1">
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
      <span className="mx-1 h-4 w-px flex-none bg-neutral-300" aria-hidden="true" />
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
      <span className="mx-1 h-4 w-px flex-none bg-neutral-300" aria-hidden="true" />
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
      <span className="mx-1 h-4 w-px flex-none bg-neutral-300" aria-hidden="true" />
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
  // Whether the HTML this draft was loaded with contained a table. Captured
  // once per draft and used as the baseline for the table-loss safety net
  // below — it must never be derived from anything the editor produces,
  // since the whole point is to detect the editor silently dropping it.
  const initialHadTable = useRef(hasTableMarkup(initialHtml));

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tablesUnsupported, setTablesUnsupported] = useState(false);
  const [, startTransition] = useTransition();

  function clearDebounce() {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }

  /**
   * Locks the editor into read-only, table-protecting mode. Idempotent:
   * safe to call from multiple detection points (initial load, autosave).
   */
  function lockForTableLoss(editor: Editor) {
    setTablesUnsupported(true);
    if (editor.isEditable) {
      editor.setEditable(false);
    }
  }

  function save(editor: Editor) {
    clearDebounce();
    const current = editor.getHTML();
    if (current === lastSavedHtml.current) return;

    // Independent safety net: even if extensions/config drift in the future,
    // never persist a save that would destroy a table that was present when
    // this draft was loaded.
    if (initialHadTable.current && !hasTableMarkup(current)) {
      setStatus("error");
      setErrorMessage(TABLES_DISABLED_MESSAGE);
      lockForTableLoss(editor);
      return;
    }

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
    extensions: [StarterKit, Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
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

  // Safety net: as soon as the editor has parsed the incoming HTML, verify
  // it didn't drop a table that was present in the source. This guards
  // against StarterKit-only configs (no table nodes) as well as any future
  // node type the editor doesn't understand yet — if content is lost on
  // load, force read-only immediately so the next autosave can't persist
  // the destruction.
  useEffect(() => {
    if (!editor) return;
    if (initialHadTable.current && !hasTableMarkup(editor.getHTML())) {
      lockForTableLoss(editor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Keep the editable state in sync if isFinal changes without remounting.
  // A detected table loss always wins over isFinal turning editing back on.
  useEffect(() => {
    const shouldBeEditable = !isFinal && !tablesUnsupported;
    if (editor && editor.isEditable !== shouldBeEditable) {
      editor.setEditable(shouldBeEditable);
    }
  }, [editor, isFinal, tablesUnsupported]);

  // Reset per-draft baselines whenever we swap to a different draft.
  useEffect(() => {
    lastSavedHtml.current = initialHtml;
    initialHadTable.current = hasTableMarkup(initialHtml);
    setTablesUnsupported(false);
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
      {tablesUnsupported ? (
        <div
          role="status"
          className="mb-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {TABLES_DISABLED_MESSAGE}
        </div>
      ) : null}
      {!isFinal && !tablesUnsupported ? <EditorToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
      {!isFinal ? (
        <div className="mt-3 flex items-center justify-end">
          <SaveIndicator status={status} errorMessage={errorMessage} />
        </div>
      ) : null}
    </div>
  );
}
