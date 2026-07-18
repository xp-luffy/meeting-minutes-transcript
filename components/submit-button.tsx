"use client";

import { useFormStatus } from "react-dom";
import { FOCUS_RING } from "@/components/ui";

/**
 * Submit button for server-action forms that reflects the ACTUAL submission
 * state via useFormStatus: disabled + spinner + pending label while the action
 * runs. Without this the form looks inert for the seconds a server action takes
 * (company lookup → insert → redirect), so users assume it's broken and click
 * again — creating duplicate records.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={
        className ??
        `${FOCUS_RING} inline-flex min-h-11 w-full items-center justify-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto sm:py-2`
      }
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
          {pendingLabel ?? "Working…"}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
