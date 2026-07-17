import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getProfile } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Meeting Minutes — Statutory Minutes from Transcripts",
  description: "Generate statutory board and committee minutes from meeting transcripts.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-neutral-50 text-neutral-900">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <Link href="/" className="text-base font-semibold tracking-tight text-neutral-900">
              Meeting Minutes
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/"
                className="text-neutral-600 transition-colors hover:text-neutral-900"
              >
                Meetings
              </Link>
              <Link
                href="/action-items"
                className="text-neutral-600 transition-colors hover:text-neutral-900"
              >
                Action Items
              </Link>
              <Link
                href="/meetings/new"
                className="rounded-md bg-indigo-600 px-3.5 py-1.5 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                New Meeting
              </Link>
              {profile ? (
                <div className="flex items-center gap-2 border-l border-neutral-200 pl-4">
                  <span className="max-w-[12rem] truncate text-neutral-600">
                    {profile.email}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                    {profile.role}
                  </span>
                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      className="text-neutral-500 transition-colors hover:text-neutral-900"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="border-l border-neutral-200 pl-4 text-neutral-500 transition-colors hover:text-neutral-900"
                >
                  Log in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
