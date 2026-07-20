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
  const [sourceType, setSourceType] = useState<"paste" | "upload">("paste");
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();

  const [isParsingDocx, setIsParsingDocx] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [docxWarnings, setDocxWarnings] = useState<string[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateWarnings, setGenerateWarnings] = useState<string[]>([]);

  const wordCount = useMemo(() => countWords(text), [text]);

  async function handleDocxUpload(file: File) {
    setIsParsingDocx(true);
    setDocxError(null);
    setDocxWarnings([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/parse-docx", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : "Could not read that DOCX — is it a valid Word file?";
        setDocxError(message);
        return;
      }

      const extractedText = typeof payload?.text === "string" ? payload.text : "";
      setText(extractedText);
      setSourceType("upload");

      if (payload?.warnings && Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        setDocxWarnings(payload.warnings);
      }
    } catch {
      setDocxError("Could not read that DOCX — is it a valid Word file?");
    } finally {
      setIsParsingDocx(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".docx")) {
      setSourceNote(null);
      void handleDocxUpload(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!lowerName.endsWith(".txt")) {
      setSourceNote("Unsupported file type — upload a .txt or .docx file, or paste the text below.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSourceNote(null);
    setDocxError(null);
    setDocxWarnings([]);
    setSourceType("upload");
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      setText(content);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSave() {
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
      <div className="rounded-surface border border-paper-200 bg-white p-4 shadow-raised sm:p-5">
        {!transcriptId ? (
          <p className="mb-3 text-body text-paper-600">
            Paste the meeting transcript below to get started.
          </p>
        ) : null}

        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSourceType("paste");
          }}
          rows={14}
          placeholder="Paste the raw meeting transcript here…"
          className="block min-h-[220px] w-full rounded-surface border border-paper-450 px-3 py-2 font-mono text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:min-h-[320px] sm:text-body"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption text-paper-500">
          <span>{wordCount} words</span>
          <label
            className={
              "inline-flex min-h-11 items-center rounded px-1 -mx-1 sm:min-h-0 " +
              (isParsingDocx
                ? "cursor-wait text-paper-500"
                : "cursor-pointer text-ink-600 hover:text-ink-700 peer-focus-visible:ring-2 peer-focus-visible:ring-ink-500 peer-focus-visible:ring-offset-2")
            }
          >
            {isParsingDocx ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-paper-300 border-t-paper-500"
                />
                Extracting text from DOCX…
              </span>
            ) : (
              "Upload .txt or .docx file"
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              disabled={isParsingDocx}
              className="peer sr-only"
            />
          </label>
        </div>

        {sourceNote ? (
          <p className="mt-2 text-caption text-status-risk-700">{sourceNote}</p>
        ) : null}

        {docxError ? (
          <div className="mt-3 rounded-surface border border-status-failed-200 bg-status-failed-50 px-3 py-2 text-body text-status-failed-700">
            {docxError}
          </div>
        ) : null}

        {docxWarnings.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-surface border border-status-risk-200 bg-status-risk-50 px-3 py-2 text-body text-status-risk-800">
            {docxWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        ) : null}

        {saveError ? (
          <div className="mt-3 rounded-surface border border-status-failed-200 bg-status-failed-50 px-3 py-2 text-body text-status-failed-700">
            {saveError}
          </div>
        ) : null}

        {saveSuccess && !saveError ? (
          <div className="mt-3 rounded-surface border border-status-verified-200 bg-status-verified-50 px-3 py-2 text-body text-status-verified-700">
            Transcript saved.
          </div>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving || text.trim().length === 0}
            className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-surface bg-ink-600 px-4 py-2.5 text-body font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:w-auto sm:py-2"
          >
            {isSaving ? (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Saving…
              </>
            ) : (
              "Save Transcript"
            )}
          </button>
        </div>
      </div>

      {transcriptId ? (
        <div className="rounded-surface border border-paper-200 bg-white p-4 shadow-raised sm:p-5">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-surface bg-ink-600 px-4 py-2.5 text-body font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto sm:py-2"
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
            <div className="mt-3 rounded-surface border border-status-failed-200 bg-status-failed-50 px-3 py-2 text-body text-status-failed-700">
              {generateError}
            </div>
          ) : null}

          {generateWarnings.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-surface border border-status-risk-200 bg-status-risk-50 px-3 py-2 text-body text-status-risk-800">
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
