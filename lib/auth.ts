import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileRole = "admin" | "cosec" | "reviewer";

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  role: ProfileRole;
  ai_model: string | null;
}

/**
 * Returns the current session user (server-side, cookie-based), or null if
 * there is no signed-in session. Never throws.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Returns the current session user's profile (id, email, role) from the
 * `profiles` table, or null if there is no session or the row can't be read
 * (RLS restricts profiles to the owning row, so this never leaks others').
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, ai_model")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Profile;
}

/**
 * Server-side guard for pages that require a signed-in user: redirects to
 * /login when there is no session, otherwise returns the session user.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
