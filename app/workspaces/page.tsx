import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMyWorkspaces, getWorkspaceMeetingCount, getWorkspaceMembers } from "@/lib/workspace";
import { createWorkspace, joinWorkspace } from "./actions";

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
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-neutral-900">Workspaces</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Share meetings with a team. Anyone in a workspace can see and edit its meetings.
      </p>

      {workspaces.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          You&apos;re not in any workspace yet — create one below.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {details.map(({ ws, members, meetingCount }) => (
            <li
              key={ws.id}
              className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <Link href={`/workspaces/${ws.id}`} className="block">
                <h2 className="text-base font-medium text-neutral-900">{ws.name}</h2>
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

      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">New workspace</h2>
        {wsError ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {wsError}
          </div>
        ) : null}
        <form action={createWorkspace} className="mt-3 flex items-center gap-2">
          <input
            name="name"
            type="text"
            required
            defaultValue={wsName}
            placeholder="e.g. Arca Holdings — Company Secretaries"
            className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="shrink-0 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
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
        <form action={joinWorkspace} className="mt-3 flex items-center gap-2">
          <input
            name="workspace_id"
            type="text"
            required
            defaultValue={joinId}
            placeholder="Workspace ID"
            className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="shrink-0 inline-flex items-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Join
          </button>
        </form>
        <p className="mt-2 text-[11px] text-neutral-400">
          v1 note: the workspace ID acts as a join token — anyone signed in who has it can join.
          Only share it with people you want in the workspace.
        </p>
      </div>
    </div>
  );
}
