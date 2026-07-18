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
      <h1 className="text-lg font-semibold text-neutral-900">Workspaces</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">
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
              className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <Link href={`/workspaces/${ws.id}`} className={`block h-full rounded-sm ${FOCUS_RING}`}>
                <h2 className="truncate text-base font-medium text-neutral-900">{ws.name}</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {members.memberCount} {members.memberCount === 1 ? "member" : "members"}
                  {" · "}
                  {meetingCount} {meetingCount === 1 ? "meeting" : "meetings"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 max-w-2xl rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">New workspace</h2>
        {wsError ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
            className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          />
          <SubmitButton
            pendingLabel="Creating…"
            className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
          >
            Create
          </SubmitButton>
        </form>
      </div>

      <div className="mt-6 max-w-2xl rounded-lg border border-neutral-200 bg-neutral-50 p-5">
        <h2 className="text-sm font-semibold text-neutral-700">Have an invite?</h2>
        <p className="mt-1 text-xs text-neutral-500">
          If someone invited your email address, you&apos;ll join that workspace automatically the
          next time you sign up. If your account already existed when the invite was sent, that
          automatic step doesn&apos;t apply — ask the workspace owner for the workspace ID instead
          and join with it below.
        </p>
        {joinError ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
            className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          />
          <SubmitButton
            pendingLabel="Joining…"
            className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
          >
            Join
          </SubmitButton>
        </form>
        <p className="mt-2 text-[11px] text-neutral-400">
          v1 note: the workspace ID acts as a join token — anyone signed in who has it can join.
          Only share it with people you want in the workspace.
        </p>
      </div>
    </div>
  );
}
