import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMyCompanies, getCompanyStatsMap } from "@/lib/companies";
import { formatDate } from "@/lib/format";
import { EmptyState, FOCUS_RING } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createCompany } from "./actions";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const getParam = (key: string): string =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const error = getParam("error");
  const nameValue = getParam("name");
  const regNoValue = getParam("reg_no");

  const companies = await getMyCompanies();
  const stats = await getCompanyStatsMap(companies.map((c) => c.id));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-page font-semibold text-paper-900">Companies</h1>
      <p className="mt-1 max-w-2xl text-body text-paper-600">
        Every company you act for, with its meeting history, resolutions register, and usual
        defaults — your institutional memory as a cosec.
      </p>

      {companies.length === 0 ? (
        <EmptyState
          compact
          message="Companies are created automatically when you create meetings — or add one below."
          className="mt-6 max-w-2xl"
        />
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => {
            const companyStats = stats.get(company.id) ?? {
              meetingCount: 0,
              openActionCount: 0,
              lastMeetingDate: null,
            };
            return (
              <li key={company.id}>
                <Link
                  href={`/companies/${company.id}`}
                  className={`block h-full rounded-surface border border-paper-300 bg-white p-4 transition-shadow hover:border-paper-450 ${FOCUS_RING}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="min-w-0 truncate text-base font-medium text-paper-900">
                      {company.name}
                    </h2>
                    {company.reg_no ? (
                      <span className="shrink-0 text-caption text-paper-600">{company.reg_no}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-body text-paper-600">
                    {companyStats.meetingCount}{" "}
                    {companyStats.meetingCount === 1 ? "meeting" : "meetings"}
                    {" · "}
                    {companyStats.openActionCount} open{" "}
                    {companyStats.openActionCount === 1 ? "action" : "actions"}
                    {companyStats.lastMeetingDate ? (
                      <>
                        {" · "}last met {formatDate(companyStats.lastMeetingDate)}
                      </>
                    ) : null}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 max-w-2xl rounded-surface border border-paper-300 bg-white p-5">
        <h2 className="text-subhead font-semibold text-paper-900">Add a company</h2>
        {error ? (
          <div className="mt-3 rounded-surface border border-status-failed-200 bg-status-failed-50 px-3 py-2 text-body text-status-failed-700">
            {error}
          </div>
        ) : null}
        <form action={createCompany} className="mt-3 space-y-3">
          <div>
            <label htmlFor="name" className="block text-body font-medium text-paper-700">
              Company name <span className="text-status-failed-600">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={nameValue}
              placeholder="e.g. Arca Holdings Sdn Bhd"
              className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
            />
          </div>
          <div>
            <label htmlFor="reg_no" className="block text-body font-medium text-paper-700">
              Registration number
            </label>
            <input
              id="reg_no"
              name="reg_no"
              type="text"
              defaultValue={regNoValue}
              placeholder="e.g. 202301012345 (1234567-A)"
              className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
            />
          </div>
          <div className="pt-1">
            <SubmitButton
              pendingLabel="Adding company…"
              className={`inline-flex min-h-11 w-full items-center justify-center rounded-surface bg-ink-600 px-4 py-2 text-body font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto ${FOCUS_RING}`}
            >
              Add company
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
