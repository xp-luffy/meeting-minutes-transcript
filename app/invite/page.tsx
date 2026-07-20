import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CopyLinkButton } from "./copy-link-button";

export default async function InvitePage() {
  await requireUser();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signupUrl = `${appUrl.replace(/\/$/, "")}/signup`;
  const mailtoHref = `mailto:?subject=${encodeURIComponent(
    "Join our Meeting Minutes workspace",
  )}&body=${encodeURIComponent(`You're invited to join our Meeting Minutes workspace: ${signupUrl}`)}`;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-page font-semibold text-paper-900">Invite a team member</h1>
      <p className="mt-1 text-body text-paper-500">
        There&apos;s no email server configured in v1, so invites are sent by sharing a link
        yourself rather than an automated email.
      </p>

      <div className="mt-6 rounded-surface border border-paper-200 bg-white p-4 shadow-raised sm:p-5">
        <label className="block text-body font-medium text-paper-700">Signup link</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            readOnly
            value={signupUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="block w-full min-w-0 rounded-surface border border-paper-450 bg-paper-50 px-3 py-2 text-base text-paper-700 shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
          />
          <CopyLinkButton text={signupUrl} />
        </div>

        <a
          href={mailtoHref}
          className="focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-surface bg-ink-600 px-4 py-2.5 text-body font-medium text-white hover:bg-ink-700 sm:min-h-0 sm:w-auto sm:py-2"
        >
          Email an invite
        </a>
      </div>

      <div className="mt-6 rounded-surface border border-ink-200 bg-ink-50 p-4 text-body text-ink-900 sm:p-5">
        <p className="font-medium">Inviting to a specific team? Workspace invites now live there.</p>
        <p className="mt-1 text-ink-800/80">
          The signup link above gives someone an account. To share specific meetings with them,
          invite their email to a workspace instead — meetings tagged to that workspace become
          visible and editable for every member.
        </p>
        <Link
          href="/workspaces"
          className="focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-surface bg-ink-600 px-4 py-2.5 text-body font-medium text-white hover:bg-ink-700 sm:min-h-0 sm:w-auto sm:py-2"
        >
          Go to Workspaces
        </Link>
      </div>

      <div className="mt-6 rounded-surface border border-paper-200 bg-paper-50 p-4 text-body text-paper-600 sm:p-5">
        <p className="font-medium text-paper-700">Roles</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-paper-700">cosec</span> — can edit minutes and
            mark drafts reviewed or final. New members default to this role.
          </li>
          <li>
            <span className="font-medium text-paper-700">reviewer</span> — can edit and mark
            drafts reviewed, but cannot finalise minutes.
          </li>
          <li>
            <span className="font-medium text-paper-700">admin</span> — full access.
          </li>
        </ul>
        <p className="mt-3 text-caption text-paper-500">
          Role changes are an admin operation and aren&apos;t self-service in v1.
        </p>
      </div>
    </div>
  );
}
