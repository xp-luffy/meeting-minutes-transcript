"use client";

import { useState, useTransition } from "react";
import { saveAiModel, type ModelOption } from "./actions";
import { FOCUS_RING } from "@/components/ui";

/**
 * In-app AI model switcher. Lists the provider's live models (with a free-text
 * override for any slug), saves the choice to the user's profile — no Vercel
 * env edit or redeploy needed. Empty selection = use the AI_MODEL env default.
 */
export function ModelPicker({
  models,
  live,
  current,
  envDefault,
}: {
  models: ModelOption[];
  live: boolean;
  current: string | null;
  envDefault: string;
}) {
  const [value, setValue] = useState(current ?? "");
  const [custom, setCustom] = useState("");
  const [saved, setSaved] = useState<string | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const knownIds = new Set(models.map((m) => m.id));
  const usingCustom = value === "__custom__" || (value !== "" && !knownIds.has(value));

  function save(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await saveAiModel(next);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(result.model ?? null);
      }
    });
  }

  const effective = saved || envDefault;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-sm font-semibold text-neutral-900">AI model for minutes generation</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Pick the model used when you click Generate. Change it anytime — it applies to your next
        generation, no redeploy.{" "}
        {live ? "Live list from your provider." : "Provider list unavailable — showing common models; you can also type any slug."}{" "}
        Browse all slugs at{" "}
        <a
          href="https://openrouter.ai/models"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 hover:underline"
        >
          openrouter.ai/models
        </a>
        .
      </p>

      <div className="mt-4 space-y-3">
        <label htmlFor="model" className="block text-xs font-medium text-neutral-700">
          Model
        </label>
        <select
          id="model"
          value={usingCustom ? "__custom__" : value}
          onChange={(e) => setValue(e.target.value)}
          className={`block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base sm:text-sm ${FOCUS_RING}`}
        >
          <option value="">Use workspace default ({envDefault})</option>
          {models.map((m) => {
            const base = m.name === m.id ? m.id : `${m.name} (${m.id})`;
            return (
              <option key={m.id} value={m.id}>
                {m.priceLabel ? `${base} — ${m.priceLabel}` : base}
              </option>
            );
          })}
          <option value="__custom__">Other (type a slug)…</option>
        </select>

        {usingCustom ? (
          <input
            type="text"
            placeholder="e.g. anthropic/claude-sonnet-4.5"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className={`block w-full rounded-md border border-neutral-300 px-3 py-2 text-base sm:text-sm ${FOCUS_RING}`}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => save(usingCustom ? custom.trim() : value)}
            className={`inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:min-h-0 sm:py-2 ${FOCUS_RING}`}
          >
            {pending ? "Saving…" : "Save model"}
          </button>
          {saved ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setValue("");
                setCustom("");
                save("");
              }}
              className="text-xs text-neutral-500 hover:text-neutral-700"
            >
              Reset to default
            </button>
          ) : null}
        </div>

        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
        <p className="text-xs text-neutral-500">
          Currently generating with: <span className="font-medium text-neutral-800">{effective}</span>
          {!saved ? " (workspace default)" : ""}
        </p>
      </div>
    </div>
  );
}
