"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose UUID check — just enough to give a friendly error before hitting the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildQuery(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `?${query.toString()}`;
}

/**
 * Maps a Supabase error to a user-facing message, same convention as the
 * rest of the app: RLS denials (42501 / "row-level security") get a
 * friendlier prompt, everything else is prefixed with context.
 */
function friendlyError(
  error: { code?: string; message: string } | null,
  fallback: string,
): string {
  if (!error) return fallback;
  if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
    return "You don't have permission to do that.";
  }
  if (error.code === "23505") {
    return "That already exists.";
  }
  if (error.code === "23503") {
    return "That workspace doesn't exist. Double-check the ID.";
  }
  return `${fallback}: ${error.message}`;
}

/**
 * Creates a workspace and adds the creator as its first member (role
 * 'owner'), then redirects to the workspace detail page.
 *
 * The two inserts aren't atomic (no client-side transactions over
 * PostgREST) — if the membership insert fails after the workspace was
 * created, the workspace still exists (visible to its creator via the
 * `created_by = auth.uid()` read policy) but its member count won't include
 * the creator. That's a narrow, self-recoverable edge case in v1: the
 * creator can still see and use the workspace, just not as a listed member.
 */
export async function createWorkspace(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect(`/workspaces${buildQuery({ ws_error: "Workspace name is required." })}`);
  }
  if (name.length > 200) {
    redirect(
      `/workspaces${buildQuery({ ws_error: "Workspace name is too long.", ws_name: name.slice(0, 200) })}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/workspaces${buildQuery({ ws_error: "Sign in to create a workspace.", ws_name: name })}`);
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/workspaces${buildQuery({
        ws_error: friendlyError(error, "Could not create workspace"),
        ws_name: name,
      })}`,
    );
  }

  await supabase
    .from("workspace_members")
    .insert({ workspace_id: data.id, user_id: user.id, role: "owner" });

  redirect(`/workspaces/${data.id}`);
}

/**
 * Joins the session user to a workspace by id. This is the v1 fallback for
 * existing accounts: the DB trigger auto-joins *new* signups whose email
 * matches a pending invite, but it can't retroactively add someone who
 * already had an account when the invite was created. Instead, the
 * workspace id doubles as a capability token — anyone signed in who has it
 * can join. `wm_insert`'s RLS policy allows self-insert unconditionally, so
 * this is enforced at the DB layer too, not just in this action.
 */
export async function joinWorkspace(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();

  if (!workspaceId) {
    redirect(`/workspaces${buildQuery({ join_error: "Enter a workspace ID." })}`);
  }
  if (!UUID_RE.test(workspaceId)) {
    redirect(
      `/workspaces${buildQuery({
        join_error: "That doesn't look like a valid workspace ID.",
        join_id: workspaceId,
      })}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/workspaces${buildQuery({ join_error: "Sign in to join a workspace." })}`);
  }

  const { error } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: user.id, role: "member" });

  if (error) {
    if (error.code === "23505") {
      redirect(`/workspaces/${workspaceId}`);
    }
    redirect(
      `/workspaces${buildQuery({
        join_error: friendlyError(error, "Could not join workspace"),
        join_id: workspaceId,
      })}`,
    );
  }

  redirect(`/workspaces/${workspaceId}`);
}

/**
 * Invites an email to a workspace by inserting a pending row into
 * `workspace_invites`. There's no email server in v1 (same limitation as
 * app/invite), so this doesn't send anything — it just records the invite
 * so the DB trigger can auto-join it on that email's next signup, or an
 * existing account can join via the workspace-id flow above.
 */
export async function inviteToWorkspace(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw.toLowerCase();

  if (!workspaceId) {
    redirect(`/workspaces${buildQuery({ error: "Missing workspace." })}`);
  }
  if (!email || !EMAIL_RE.test(email)) {
    redirect(
      `/workspaces/${workspaceId}${buildQuery({ invite_error: "Enter a valid email address." })}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_invites")
    .insert({ workspace_id: workspaceId, email });

  if (error) {
    redirect(
      `/workspaces/${workspaceId}${buildQuery({
        invite_error: friendlyError(error, "Could not send invite"),
      })}`,
    );
  }

  redirect(`/workspaces/${workspaceId}?invited=1`);
}

/** Removes a pending invite (the inviter, or any fellow member, may do this per RLS). */
export async function removeInvite(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const inviteId = String(formData.get("invite_id") ?? "").trim();

  if (!workspaceId || !inviteId) {
    redirect(`/workspaces${buildQuery({ error: "Missing invite." })}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("workspace_invites").delete().eq("id", inviteId);

  if (error) {
    redirect(
      `/workspaces/${workspaceId}${buildQuery({
        invite_error: friendlyError(error, "Could not remove invite"),
      })}`,
    );
  }

  redirect(`/workspaces/${workspaceId}`);
}
