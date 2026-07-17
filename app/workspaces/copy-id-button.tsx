"use client";

import { useState } from "react";

/** Small button that copies the given text to the clipboard with a brief confirmation. */
export function CopyIdButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail — the ID is still visible and selectable next to this button.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
