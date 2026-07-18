"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SaveModelResult {
  model?: string | null;
  error?: string;
}

/**
 * Sets the current user's preferred AI model via the security-definer RPC
 * (which only touches ai_model on the caller's own row — role stays locked).
 * Empty string clears it (falls back to the AI_MODEL env / default).
 */
export async function saveAiModel(model: string): Promise<SaveModelResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to change the model." };

  const { data, error } = await supabase.rpc("set_my_ai_model", { p_model: model });
  if (error) {
    return { error: "Could not save the model — please try again." };
  }
  revalidatePath("/settings");
  return { model: (data as string | null) ?? null };
}

export interface ModelOption {
  id: string;
  name: string;
}

/**
 * Lists available models from the configured AI gateway (OpenRouter/OpenAI —
 * `${AI_BASE_URL}/models`). Best-effort: returns a small curated fallback list
 * if the provider can't be reached or no key is set, so the picker always works.
 */
export async function listModels(): Promise<{ models: ModelOption[]; live: boolean }> {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");

  const fallback: ModelOption[] = [
    { id: "openai/gpt-4o", name: "OpenAI GPT-4o" },
    { id: "openai/gpt-4o-mini", name: "OpenAI GPT-4o mini" },
    { id: "anthropic/claude-sonnet-4.5", name: "Anthropic Claude Sonnet 4.5" },
    { id: "anthropic/claude-3.7-sonnet", name: "Anthropic Claude 3.7 Sonnet" },
    { id: "google/gemini-2.5-pro", name: "Google Gemini 2.5 Pro" },
    { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Meta Llama 3.3 70B" },
  ];

  if (!apiKey) return { models: fallback, live: false };

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      // models list changes slowly; let Next cache it for an hour
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { models: fallback, live: false };
    const json = (await res.json()) as { data?: { id: string; name?: string }[] };
    const models = (json.data ?? [])
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ id: m.id, name: m.name || m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (models.length === 0) return { models: fallback, live: false };
    return { models, live: true };
  } catch {
    return { models: fallback, live: false };
  }
}
