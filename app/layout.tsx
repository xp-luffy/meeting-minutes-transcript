import type { Metadata, Viewport } from "next";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { getProfile } from "@/lib/auth";
import { SiteHeader } from "./site-header";

/**
 * One webfont, loaded for one job: the minutes themselves.
 *
 * `--font-serif` was declared in globals.css and used nowhere, so the record
 * and the interface rendered in the same face and the document outranked
 * nothing on screen. Typography now says which is which before a word is read:
 * serif for the statutory record, system sans for all software chrome.
 *
 * Deliberately NOT loading a sans webfont. Chrome stays on native faces at 0KB
 * — the whole budget goes to the face that carries meaning.
 */
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif-loaded",
});

export const metadata: Metadata = {
  title: "Meeting Minutes — Statutory Minutes from Transcripts",
  description: "Generate statutory board and committee minutes from meeting transcripts.",
};

// Without this, phones use a 980px layout viewport and every responsive
// breakpoint (sm:/md:) stays inactive — the mobile design never engages.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  return (
    <html lang="en" className={sourceSerif.variable}>
      {/* paper-100, not paper-50: card-to-page separation goes 1.03 -> ~1.07:1,
          so a card reads as a plate on a toned page rather than dissolving into
          it. Ships together with retiring text-paper-500 (138 sites -> 600) —
          paper-500 falls below the AA floor on this ground, and separating the
          two changes would put the app out of compliance. */}
      <body className="antialiased min-h-screen bg-paper-100 text-paper-900">
        <SiteHeader profile={profile} />
        <main className="md:pl-60">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
