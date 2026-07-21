import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileRole = "admin" | "cosec" | "reviewer";

/**
 * The role WITHIN an organisation — distinct from `ProfileRole`, which describes
 * what someone does in the product (cosec, reviewer) rather than what they may
 * administer.
 *
 * These were the same field once, and that was the bug: `profiles.role = 'admin'`
 * was APP-WIDE, so one admin could read and rotate every firm's GroundStream
 * credential. Tenancy questions must be answered by `OrgRole`; never by
 * `Profile.role`.
 */
export type OrgRole = "owner" | "admin" | "member";

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

/** The tenant the signed-in user is acting in. */
export interface OrgContext {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
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
 * The organisation the signed-in user is acting in, or null.
 *
 * NULL IS "SEE NOTHING", never "see everything". Every RLS policy is written as
 * `AND is_org_member(org_id)`, so a caller without an organisation reads zero
 * rows — this function returning null must lead to a refusal in the UI, not a
 * fallback to some default tenant.
 *
 * Read through the REQUEST-SCOPED client on purpose: the row comes back only if
 * RLS agrees the caller is a member, so the UI and the database cannot disagree
 * about which tenant someone is in.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("organisation_members")
    .select("role, organisations!inner(id, slug, name)")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{
      role: OrgRole;
      organisations: { id: string; slug: string; name: string };
    }>();

  // supabase-js RESOLVES with { error } rather than throwing, so this must be
  // destructured and checked. An unchecked result here would turn a database
  // problem into "user has no organisation" — which reads identically to a
  // legitimate refusal and would be diagnosed as a permissions bug for hours.
  if (error) {
    console.error("[auth] organisation lookup FAILED", error.message);
    return null;
  }
  if (!data?.organisations) return null;

  return {
    id: data.organisations.id,
    slug: data.organisations.slug,
    name: data.organisations.name,
    role: data.role,
  };
}

/** True when the caller may administer their organisation's settings. */
export async function isOrgAdmin(): Promise<boolean> {
  const org = await getOrgContext();
  return org?.role === "owner" || org?.role === "admin";
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
