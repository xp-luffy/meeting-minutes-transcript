import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meeting Minutes — Statutory Minutes from Transcripts",
  description: "Generate statutory board and committee minutes from meeting transcripts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
                href="/meetings/new"
                className="rounded-md bg-indigo-600 px-3.5 py-1.5 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                New Meeting
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
