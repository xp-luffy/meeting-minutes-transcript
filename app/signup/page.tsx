"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Maps common Supabase sign-up error messages to friendlier copy. Falls back
 * to the raw message for anything unrecognised.
 */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "An account with that email already exists — try logging in instead.";
  }
  if (lower.includes("password should be at least") || lower.includes("password is too short")) {
    return "Password is too weak — use at least 6 characters.";
  }
  return message;
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    setIsSubmitting(false);

    if (signUpError) {
      setError(friendlyAuthError(signUpError.message));
      return;
    }

    if (data.user && !data.session) {
      // Email confirmation is required before a session is issued.
      setInfoMessage("Check your email to confirm your account.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-1">
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-lg font-semibold text-neutral-900">Sign up</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Create an account to save and manage meetings.
        </p>

        {error ? (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {infoMessage ? (
          <div className="mt-5 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
            {infoMessage}
          </div>
        ) : null}

        {!infoMessage ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                placeholder="At least 6 characters"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:py-2"
            >
              {isSubmitting ? (
                <>
                  <span
                    aria-hidden
                    className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Creating account…
                </>
              ) : (
                "Sign up"
              )}
            </button>
          </form>
        ) : null}

        <p className="mt-6 text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link href="/login" className="focus-ring rounded font-medium text-indigo-600 hover:text-indigo-700">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
