"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function buildQuery(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `?${query.toString()}`;
}

/**
 * Maps a Supabase error to a user-facing message — same convention used by
 * app/meetings/new/actions.ts and app/workspaces/actions.ts.
 */
function friendlyError(error: { code?: string; message: string } | null, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
    return "Your session has expired — sign in again to save changes.";
  }
  return `${fallback}: ${error.message}`;
}

/** Creates a company (name + optional registration number) and opens its detail page. */
export async function createCompany(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const regNo = String(formData.get("reg_no") ?? "").trim();

  if (!name) {
    redirect(`/companies${buildQuery({ error: "Company name is required." })}`);
  }
  if (name.length > 200) {
    redirect(
      `/companies${buildQuery({ error: "Company name is too long.", name: name.slice(0, 200), reg_no: regNo })}`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({ name, reg_no: regNo || null })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/companies${buildQuery({
        error: friendlyError(error, "Could not create company"),
        name,
        reg_no: regNo,
      })}`,
    );
  }

  redirect(`/companies/${data.id}`);
}
