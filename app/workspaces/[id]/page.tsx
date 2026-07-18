import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace, getWorkspaceMembers } from "@/lib/workspace";
import { EmptyState, FOCUS_RING, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import { CopyIdButton } from "../copy-id-button";
import { inviteToWorkspace, removeInvite } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export default async function WorkspaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const getParam = (key: string): string =>
    typeof query[key] === "string" ? (query[key] as string) : "";
  const inviteError = getParam("invite_error");
  const invited = getParam("invited") === "1";

  const workspace = await getWorkspace(id);
  if (!workspace) {
    notFound();
  }

  const members = await getWorkspaceMembers(id);

  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from("meetings")
    .select(
      "id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status, created_at",
    )
    .eq("workspace_id", id)
    .order("meeting_date", { ascending: false });

  const meetingList = (meetings ?? []) as Meeting[];
  const isCreator = workspace.created_by === user.id;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm">
        <Link href="/workspaces" className={`rounded-sm text-neutral-500 hover:text-neutral-700 ${FOCUS_RING}`}>
          &larr; Workspaces
        </Link>
      </p>
      <h1 className="mt-2 text-lg font-semibold text-neutral-900">{workspace.name}</h1>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">Members</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {members.memberCount} {members.memberCount === 1 ? "member" : "members"}
          {members.selfRole ? (
            <> &middot; you are {members.selfRole === "owner" ? "an owner" : "a member"}</>
          ) : isCreator ? (
            <> &middot; you created this workspace</>
          ) : null}
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Only your own email is ever shown here — other members&apos; emails aren&apos;t
          resolvable under the app&apos;s row-level security, so they&apos;re counted but not
          listed by name.
        </p>

        {members.pendingInvites.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium text-neutral-700">Pending invites</p>
            <ul className="mt-2 space-y-2">
              {members.pendingInvites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
                >
                  <span className="min-w-0 truncate">{invite.email}</span>
                  <form action={removeInvite}>
                    <input type="hidden" name="workspace_id" value={id} />
                    <input type="hidden" name="invite_id" value={invite.id} />
                    <SubmitButton
                      pendingLabel="Removing…"
                      className={`ml-3 shrink-0 rounded-sm text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {invited ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Invite recorded. They&apos;ll join automatically when they sign up — or, if they
            already have an account, they can join now using the workspace ID below.
          </div>
        ) : null}
        {inviteError ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {inviteError}
          </div>
        ) : null}

        <form action={inviteToWorkspace} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="workspace_id" value={id} />
          <input
            name="email"
            type="email"
            required
            placeholder="colleague@company.com"
            className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          />
          <SubmitButton
            pendingLabel="Inviting…"
            className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
          >
            Invite
          </SubmitButton>
        </form>

        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-medium text-neutral-700">
            Existing account, no email server yet?
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            New invites auto-apply the next time that email signs up. For someone who already has
            an account, share this workspace ID instead — they can join it from the{" "}
            <Link href="/workspaces" className={`rounded-sm text-indigo-600 hover:underline ${FOCUS_RING}`}>
              Workspaces
            </Link>{" "}
            page&apos;s &ldquo;Have an invite?&rdquo; section.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              readOnly
              value={workspace.id}
              className="block w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 shadow-sm"
            />
            <CopyIdButton text={workspace.id} />
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Meetings</h2>
          <Link
            href={`/meetings/new?workspace=${workspace.id}`}
            className={`inline-flex min-h-11 items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 sm:min-h-0 sm:py-1.5 ${FOCUS_RING}`}
          >
            New meeting in this workspace
          </Link>
        </div>

        {meetingList.length === 0 ? (
          <EmptyState compact message="No meetings in this workspace yet." />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {meetingList.map((meeting) => (
              <li key={meeting.id}>
                <Link
                  href={`/meetings/${meeting.id}`}
                  className={`block h-full rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${FOCUS_RING}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="min-w-0 truncate text-sm font-medium text-neutral-900">
                      {meeting.company_name}
                    </h3>
                    <StatusBadge status={meeting.status} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {meeting.meeting_type} &middot; {formatDate(meeting.meeting_date)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
