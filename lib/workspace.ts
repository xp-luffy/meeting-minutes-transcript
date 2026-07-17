import { createClient } from "@/lib/supabase/server";

export interface WorkspaceSummary {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  created_at: string;
}

export interface WorkspaceMembers {
  /** Total rows in workspace_members for this workspace (RLS lets any fellow member read all of them). */
  memberCount: number;
  /** The session user's own role, or null if they can see the workspace (as creator) without a membership row. */
  selfRole: "owner" | "member" | null;
  /** Pending (not-yet-accepted) invites — only their emails are ever exposed, never other members' emails. */
  pendingInvites: PendingInvite[];
}

/**
 * Returns the workspaces visible to the current session user. RLS on
 * `workspaces` already restricts rows to ones the user created or is a
 * member of, so a plain select returns exactly the right set — no need to
 * union two queries client-side.
 */
export async function getMyWorkspaces(): Promise<WorkspaceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, created_by, created_at")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as WorkspaceSummary[];
}

/**
 * Returns a single workspace by id, or null if it doesn't exist or RLS hides
 * it (caller should treat null as "not found" — e.g. call notFound()).
 */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, created_by, created_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  return data as WorkspaceSummary;
}

/**
 * Member count + pending invites for a workspace.
 *
 * Honesty note: we can't resolve *other* members' emails here. The
 * `profiles` table's RLS only allows reading your own row, so a join from
 * workspace_members to profiles would silently drop every row that isn't
 * the caller's — that would look like a real email list but be wrong for
 * multi-member workspaces. Instead we show an honest count of all members
 * (workspace_members RLS does let fellow members read every row in a
 * workspace they belong to) plus the session user's own role, and surface
 * *invite* emails (which the inviter/members can legitimately read) as the
 * only email-shaped data on the page.
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMembers> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);

  const memberRows = members ?? [];
  const selfRow = user ? memberRows.find((m) => m.user_id === user.id) : undefined;

  const { data: invites } = await supabase
    .from("workspace_invites")
    .select("id, email, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return {
    memberCount: memberRows.length,
    selfRole: (selfRow?.role as "owner" | "member" | undefined) ?? null,
    pendingInvites: (invites ?? []) as PendingInvite[],
  };
}

/** Number of meetings (visible to the session user, per RLS) tagged to this workspace. */
export async function getWorkspaceMeetingCount(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  return count ?? 0;
}
