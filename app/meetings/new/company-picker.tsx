"use client";

import { useState } from "react";
import { NEW_COMPANY_VALUE } from "@/lib/constants";

// Re-exported for existing importers; the source of truth lives in
// lib/constants.ts so server code gets the literal, not a client reference.
export { NEW_COMPANY_VALUE };

export interface CompanyOption {
  id: string;
  name: string;
}

/**
 * Company selector for /meetings/new: a <select name="company_id"> of the
 * user's companies plus a "— New company —" option that reveals a plain
 * `company_name` text input. Kept as a small client component only so the
 * new-company name field can be shown/hidden without a page reload — the
 * server action (createMeeting) still does all the real work (looking up
 * the chosen company, or creating a new one).
 */
export function CompanyPicker({
  companies,
  initialCompanyId,
  initialCompanyName,
}: {
  companies: CompanyOption[];
  initialCompanyId?: string;
  initialCompanyName?: string;
}) {
  const validInitialId =
    initialCompanyId && companies.some((c) => c.id === initialCompanyId) ? initialCompanyId : "";
  const [companyId, setCompanyId] = useState(validInitialId || NEW_COMPANY_VALUE);
  const isNew = companyId === NEW_COMPANY_VALUE;

  return (
    <div>
      <label htmlFor="company_id" className="block text-body font-medium text-paper-700">
        Company <span className="text-status-failed-600">*</span>
      </label>
      <select
        id="company_id"
        name="company_id"
        value={companyId}
        onChange={(e) => setCompanyId(e.target.value)}
        className="mt-1 block w-full rounded-surface border border-paper-450 bg-white px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
        <option value={NEW_COMPANY_VALUE}>— New company —</option>
      </select>
      <p className="mt-1 text-caption text-paper-500">
        Picking a company autofills venue, chairperson, attendees, and minutes format from its
        last meeting — you can still edit any field before saving.
      </p>

      {isNew ? (
        <div className="mt-3">
          <label htmlFor="company_name" className="block text-body font-medium text-paper-700">
            New company name <span className="text-status-failed-600">*</span>
          </label>
          <input
            id="company_name"
            name="company_name"
            type="text"
            required
            defaultValue={initialCompanyName}
            className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
            placeholder="e.g. Arca Holdings Sdn Bhd"
          />
        </div>
      ) : null}
    </div>
  );
}
