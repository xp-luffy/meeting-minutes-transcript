"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Maps common Supabase auth error messages to friendlier copy. Falls back to
 * the raw message for anything unrecognised.
 */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before signing in — check your inbox for the confirmation link.";
  }
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (signInError) {
      setError(friendlyAuthError(signInError.message));
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-1">
      <div className="rounded-surface border border-paper-200 bg-white p-6 shadow-raised sm:p-8">
        <h1 className="text-page font-semibold text-paper-900">Log in</h1>
        <p className="mt-1 text-body text-paper-500">Sign in to manage your meetings.</p>

        {error ? (
          <div className="mt-5 rounded-surface border border-status-failed-200 bg-status-failed-50 px-4 py-3 text-body text-status-failed-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-body font-medium text-paper-700">
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
              className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-body font-medium text-paper-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-surface border border-paper-450 px-3 py-2 text-base shadow-raised focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:text-body"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-surface bg-ink-600 px-4 py-2.5 text-body font-medium text-white hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:py-2"
          >
            {isSubmitting ? (
              <>
                <span
                  aria-hidden
                  className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Signing in…
              </>
            ) : (
              "Log in"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-body text-paper-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="focus-ring rounded font-medium text-ink-600 hover:text-ink-700">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
