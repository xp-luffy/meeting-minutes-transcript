"use client";

import { useState } from "react";

/** Small button that copies the given text to the clipboard with a brief confirmation. */
export function CopyLinkButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (unsupported browser, no permission) — the
      // URL is still visible and selectable in the field next to this button.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="focus-ring inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:min-h-0 sm:w-auto"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
