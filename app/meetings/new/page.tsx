import { createMeeting } from "./actions";
import { MEETING_TYPES } from "@/lib/constants";

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const getParam = (key: string): string =>
    typeof params[key] === "string" ? (params[key] as string) : "";

  const error = getParam("error");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-neutral-900">New Meeting</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Create a meeting record, then add a transcript to generate statutory minutes.
      </p>

      {error ? (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form action={createMeeting} className="mt-6 space-y-5">
        <div>
          <label htmlFor="company_name" className="block text-sm font-medium text-neutral-700">
            Company name <span className="text-red-600">*</span>
          </label>
          <input
            id="company_name"
            name="company_name"
            type="text"
            required
            defaultValue={getParam("company_name")}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g. Arca Holdings Sdn Bhd"
          />
        </div>

        <div>
          <label htmlFor="meeting_type" className="block text-sm font-medium text-neutral-700">
            Meeting type <span className="text-red-600">*</span>
          </label>
          <select
            id="meeting_type"
            name="meeting_type"
            required
            defaultValue={getParam("meeting_type")}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
          <label htmlFor="meeting_date" className="block text-sm font-medium text-neutral-700">
            Meeting date <span className="text-red-600">*</span>
          </label>
          <input
            id="meeting_date"
            name="meeting_date"
            type="date"
            required
            defaultValue={getParam("meeting_date")}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="venue" className="block text-sm font-medium text-neutral-700">
            Venue
          </label>
          <input
            id="venue"
            name="venue"
            type="text"
            defaultValue={getParam("venue")}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g. Level 12, Menara Arca, Kuala Lumpur"
          />
        </div>

        <div>
          <label htmlFor="chairperson" className="block text-sm font-medium text-neutral-700">
            Chairperson
          </label>
          <input
            id="chairperson"
            name="chairperson"
            type="text"
            defaultValue={getParam("chairperson")}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g. Dato' Ahmad Fauzi bin Ismail"
          />
        </div>

        <div>
          <label htmlFor="attendees" className="block text-sm font-medium text-neutral-700">
            Attendees
          </label>
          <textarea
            id="attendees"
            name="attendees"
            rows={5}
            defaultValue={getParam("attendees")}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder={"One per line as Name — Role\ne.g. Ms Sarah Tan — Company Secretary"}
          />
          <p className="mt-1 text-xs text-neutral-500">
            One per line, as &ldquo;Name — Role&rdquo; (a comma also works as the separator).
          </p>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Meeting
          </button>
        </div>
      </form>
    </div>
  );
}
