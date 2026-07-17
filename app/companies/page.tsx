import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMyCompanies, getCompanyStatsMap } from "@/lib/companies";
import { formatDate } from "@/lib/format";
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
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-neutral-900">Companies</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every company you act for, with its meeting history, resolutions register, and usual
        defaults — your institutional memory as a cosec.
      </p>

      {companies.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          Companies are created automatically when you create meetings — or add one below.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
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
                  className="block rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="truncate text-base font-medium text-neutral-900">
                      {company.name}
                    </h2>
                    {company.reg_no ? (
                      <span className="text-xs text-neutral-400">{company.reg_no}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
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

      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">Add a company</h2>
        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <form action={createCompany} className="mt-3 space-y-3">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
              Company name <span className="text-red-600">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={nameValue}
              placeholder="e.g. Arca Holdings Sdn Bhd"
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="reg_no" className="block text-sm font-medium text-neutral-700">
              Registration number
            </label>
            <input
              id="reg_no"
              name="reg_no"
              type="text"
              defaultValue={regNoValue}
              placeholder="e.g. 202301012345 (1234567-A)"
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="pt-1">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Add company
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
