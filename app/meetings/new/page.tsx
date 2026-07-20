import { createMeeting } from "./actions";
import { MEETING_TYPES } from "@/lib/constants";
import { getMyWorkspaces } from "@/lib/workspace";
import { getMyCompanies } from "@/lib/companies";
import { CompanyPicker } from "./company-picker";
import { SubmitButton } from "@/components/submit-button";

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const getParam = (key: string): string =>
    typeof params[key] === "string" ? (params[key] as string) : "";

  const error = getParam("error");
  const [workspaces, companies] = await Promise.all([getMyWorkspaces(), getMyCompanies()]);
  const selectedWorkspace = getParam("workspace_id") || getParam("workspace");
  const selectedCompany = getParam("company_id") || getParam("company");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-page font-semibold text-paper-900">New Meeting</h1>
      <p className="mt-1 text-body text-paper-500">
        Create a meeting record, then add a transcript to generate statutory minutes.
      </p>

      {error ? (
        <div className="mt-5 rounded-surface border border-status-failed-200 bg-status-failed-50 px-4 py-3 text-body text-status-failed-700">
          {error}
        </div>
      ) : null}

      <form action={createMeeting} className="mt-6 space-y-5">
        <CompanyPicker
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          initialCompanyId={selectedCompany}
          initialCompanyName={getParam("company_name")}
        />

        <div>
          <label htmlFor="meeting_type" className="block text-body font-medium text-paper-700">
            Meeting type <span className="text-status-failed-600">*</span>
          </label>
          <select
            id="meeting_type"
            name="meeting_type"
            required
            defaultValue={getParam("meeting_type")}
            className="mt-1 block w-full rounded-surface border border-paper-450 bg-white px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
          >
            <option value="" disabled>
              Select a meeting type
            </option>
            {MEETING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="workspace_id" className="block text-body font-medium text-paper-700">
            Workspace
          </label>
          <select
            id="workspace_id"
            name="workspace_id"
            defaultValue={selectedWorkspace}
            className="mt-1 block w-full rounded-surface border border-paper-450 bg-white px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
          >
            <option value="">Personal (no workspace)</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-caption text-paper-500">
            Workspace meetings are visible and editable by every member. Personal meetings stay
            visible to only you.
          </p>
        </div>

        <div>
          <label htmlFor="minutes_format" className="block text-body font-medium text-paper-700">
            Minutes format
          </label>
          <select
            id="minutes_format"
            name="minutes_format"
            defaultValue={getParam("minutes_format") || "standard"}
            className="mt-1 block w-full rounded-surface border border-paper-450 bg-white px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
          >
            <option value="standard">Standard statutory</option>
            <option value="maisca">Maisca committee style</option>
          </select>
          <p className="mt-1 text-caption text-paper-500">
            Maisca style: header &amp; attendance tables, quorum per Terms of Reference,
            Chairman&rsquo;s confidentiality address, numbered agenda-item table. Format defaults
            to this company&rsquo;s usual style if you leave this as Standard.
          </p>
        </div>

        <div>
          <label htmlFor="meeting_date" className="block text-body font-medium text-paper-700">
            Meeting date <span className="text-status-failed-600">*</span>
          </label>
          <input
            id="meeting_date"
            name="meeting_date"
            type="date"
            required
            defaultValue={getParam("meeting_date")}
            className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
          />
        </div>

        <div>
          <label htmlFor="venue" className="block text-body font-medium text-paper-700">
            Venue
          </label>
          <input
            id="venue"
            name="venue"
            type="text"
            defaultValue={getParam("venue")}
            className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
            placeholder="e.g. Level 12, Menara Arca, Kuala Lumpur"
          />
          <p className="mt-1 text-caption text-paper-500">
            Leave blank to use this company&rsquo;s usual venue, if it has one on record.
          </p>
        </div>

        <div>
          <label htmlFor="chairperson" className="block text-body font-medium text-paper-700">
            Chairperson
          </label>
          <input
            id="chairperson"
            name="chairperson"
            type="text"
            defaultValue={getParam("chairperson")}
            className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
            placeholder="e.g. Dato' Ahmad Fauzi bin Ismail"
          />
          <p className="mt-1 text-caption text-paper-500">
            Leave blank to use this company&rsquo;s usual chairperson, if it has one on record.
          </p>
        </div>

        <div>
          <label htmlFor="attendees" className="block text-body font-medium text-paper-700">
            Attendees
          </label>
          <textarea
            id="attendees"
            name="attendees"
            rows={5}
            defaultValue={getParam("attendees")}
            className="mt-1 block min-h-[120px] w-full rounded-surface border border-paper-450 px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
            placeholder={"One per line as Name — Role\ne.g. Ms Sarah Tan — Company Secretary"}
          />
          <p className="mt-1 text-caption text-paper-500">
            One per line, as &ldquo;Name — Role&rdquo; (a comma also works as the separator).
            Leave blank to use this company&rsquo;s usual attendee list, if it has one on record.
          </p>
        </div>

        <div className="pt-2">
          <SubmitButton
            pendingLabel="Creating meeting…"
            className="focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-surface bg-ink-600 px-4 py-2.5 text-body font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto sm:py-2"
          >
            Create Meeting
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
