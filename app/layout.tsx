import type { Metadata } from "next";
import "./globals.css";
import { getProfile } from "@/lib/auth";
import { SiteHeader } from "./site-header";

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
        <SiteHeader profile={profile} />
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
