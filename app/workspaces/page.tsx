import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMyWorkspaces, getWorkspaceMeetingCount, getWorkspaceMembers } from "@/lib/workspace";
import { EmptyState, FOCUS_RING } from "@/components/ui";
import { createWorkspace, joinWorkspace } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const getParam = (key: string): string =>
    typeof params[key] === "string" ? (params[key] as string) : "";

  const wsError = getParam("ws_error");
  const wsName = getParam("ws_name");
  const joinError = getParam("join_error");
  const joinId = getParam("join_id");

  const workspaces = await getMyWorkspaces();
  const details = await Promise.all(
    workspaces.map(async (ws) => {
      const [members, meetingCount] = await Promise.all([
        getWorkspaceMembers(ws.id),
        getWorkspaceMeetingCount(ws.id),
      ]);
      return { ws, members, meetingCount };
    }),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-page font-semibold text-paper-900">Workspaces</h1>
      <p className="mt-1 max-w-2xl text-body text-paper-600">
        Share meetings with a team. Anyone in a workspace can see and edit its meetings.
      </p>

      {workspaces.length === 0 ? (
        <EmptyState
          compact
          message="You're not in any workspace yet — create one below."
          className="mt-6 max-w-2xl"
        />
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {details.map(({ ws, members, meetingCount }) => (
            <li
              key={ws.id}
              className="rounded-surface border border-paper-300 bg-white p-4 transition-shadow hover:border-paper-450"
            >
              <Link href={`/workspaces/${ws.id}`} className={`block h-full rounded-control ${FOCUS_RING}`}>
                <h2 className="truncate text-base font-medium text-paper-900">{ws.name}</h2>
                <p className="mt-1 text-body text-paper-600">
                  {members.memberCount} {members.memberCount === 1 ? "member" : "members"}
                  {" · "}
                  {meetingCount} {meetingCount === 1 ? "meeting" : "meetings"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 max-w-2xl rounded-surface border border-paper-300 bg-white p-5">
        <h2 className="text-subhead font-semibold text-paper-900">New workspace</h2>
        {wsError ? (
          <div className="mt-3 rounded-surface border border-status-failed-200 bg-status-failed-50 px-3 py-2 text-body text-status-failed-700">
            {wsError}
          </div>
        ) : null}
        <form action={createWorkspace} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            name="name"
            type="text"
            required
            defaultValue={wsName}
            placeholder="e.g. Arca Holdings — Company Secretaries"
            className="block w-full rounded-surface border border-paper-450 px-3 py-2 text-base focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
          />
          <SubmitButton
            pendingLabel="Creating…"
            className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-surface bg-ink-600 px-4 py-2 text-body font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
          >
            Create
          </SubmitButton>
        </form>
      </div>

      <div className="mt-6 max-w-2xl rounded-surface border border-paper-300 bg-paper-50 p-5">
        <h2 className="text-subhead font-semibold text-paper-700">Have an invite?</h2>
        <p className="mt-1 text-caption text-paper-600">
          If someone invited your email address, you&apos;ll join that workspace automatically the
          next time you sign up. If your account already existed when the invite was sent, that
          automatic step doesn&apos;t apply — ask the workspace owner for the workspace ID instead
          and join with it below.
        </p>
        {joinError ? (
          <div className="mt-3 rounded-surface border border-status-failed-200 bg-status-failed-50 px-3 py-2 text-body text-status-failed-700">
            {joinError}
          </div>
        ) : null}
        <form action={joinWorkspace} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            name="workspace_id"
            type="text"
            required
            defaultValue={joinId}
            placeholder="Workspace ID"
            className="block w-full rounded-surface border border-paper-450 bg-white px-3 py-2 text-base focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
          />
          <SubmitButton
            pendingLabel="Joining…"
            className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-surface border border-paper-450 bg-white px-4 py-2 text-body font-medium text-paper-700 hover:bg-paper-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
          >
            Join
          </SubmitButton>
        </form>
        <p className="mt-2 text-[11px] text-paper-600">
          v1 note: the workspace ID acts as a join token — anyone signed in who has it can join.
          Only share it with people you want in the workspace.
        </p>
      </div>
    </div>
  );
}
