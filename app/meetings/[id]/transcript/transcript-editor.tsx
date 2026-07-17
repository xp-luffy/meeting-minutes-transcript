"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTranscript } from "./actions";

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

export function TranscriptEditor({
  meetingId,
  initialText,
  initialTranscriptId,
}: {
  meetingId: string;
  initialText: string;
  initialTranscriptId: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState(initialText);
  const [transcriptId, setTranscriptId] = useState<string | null>(initialTranscriptId);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateWarnings, setGenerateWarnings] = useState<string[]>([]);

  const wordCount = useMemo(() => countWords(text), [text]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setSourceNote("DOCX upload coming soon — paste the text for now.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSourceNote(null);
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      setText(content);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSave(sourceType: "paste" | "upload") {
    setSaveError(null);
    setSaveSuccess(false);
    startSaveTransition(async () => {
      const result = await saveTranscript(meetingId, text, sourceType);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      if (result.transcriptId) {
        setTranscriptId(result.transcriptId);
        setSaveSuccess(true);
        router.refresh();
      }
    });
  }

  async function handleGenerate() {
    if (!transcriptId) return;
    setIsGenerating(true);
    setGenerateError(null);
    setGenerateWarnings([]);

    try {
      const response = await fetch("/api/generate-minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, transcriptId }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : "Minutes generation failed. Try again.";
        setGenerateError(message);
        setIsGenerating(false);
        return;
      }

      if (payload?.warnings && Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        setGenerateWarnings(payload.warnings);
      }

      router.push(`/meetings/${meetingId}/draft`);
      router.refresh();
    } catch {
      setGenerateError("Minutes generation failed. Try again.");
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        {!transcriptId ? (
          <p className="mb-3 text-sm text-neutral-600">
            Paste the meeting transcript below to get started.
          </p>
        ) : null}

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={14}
          placeholder="Paste the raw meeting transcript here…"
          className="block w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <span>{wordCount} words</span>
          <label className="cursor-pointer text-indigo-600 hover:text-indigo-700">
            Upload .txt file
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {sourceNote ? (
          <p className="mt-2 text-xs text-amber-700">{sourceNote}</p>
        ) : null}

        {saveError ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {saveError}
          </div>
        ) : null}

        {saveSuccess && !saveError ? (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Transcript saved.
          </div>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => handleSave("paste")}
            disabled={isSaving || text.trim().length === 0}
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Transcript"}
          </button>
        </div>
      </div>

      {transcriptId ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Generating minutes… up to 30 s
              </>
            ) : (
              "Generate Minutes"
            )}
          </button>

          {generateError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {generateError}
            </div>
          ) : null}

          {generateWarnings.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {generateWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
