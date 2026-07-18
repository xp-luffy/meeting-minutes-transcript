"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/auth";

interface NavLink {
  href: string;
  label: string;
}

/**
 * App header: wordmark, primary nav, New Meeting action, and auth area.
 * At <md the primary nav links collapse into a hamburger-triggered panel;
 * the wordmark, New Meeting action (icon-only at the smallest widths), and
 * auth area stay visible in the top bar at every width.
 */
export function SiteHeader({ profile }: { profile: Profile | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu whenever the route changes (client-side nav).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const links: NavLink[] = [
    { href: "/", label: "Meetings" },
    { href: "/action-items", label: "Action Items" },
    ...(profile ? [{ href: "/obligations", label: "Obligations" }] : []),
    ...(profile ? [{ href: "/companies", label: "Companies" }] : []),
    ...(profile ? [{ href: "/people", label: "People" }] : []),
    ...(profile ? [{ href: "/workspaces", label: "Workspaces" }] : []),
    ...(profile ? [{ href: "/settings", label: "Settings" }] : []),
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-nav-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className="focus-ring tap-target -ml-2 inline-flex items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 md:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-5 w-5">
              {menuOpen ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
          <Link
            href="/"
            className="focus-ring truncate rounded-md text-base font-semibold tracking-tight text-neutral-900"
          >
            Meeting Minutes
          </Link>
        </div>

        <nav className="hidden items-center gap-4 text-sm md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="focus-ring rounded-md text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/meetings/new"
            aria-label="New Meeting"
            className="focus-ring tap-target inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 sm:px-3.5"
          >
            <span aria-hidden className="text-base leading-none sm:hidden">
              +
            </span>
            <span className="hidden sm:inline">New Meeting</span>
          </Link>

          {profile ? (
            <div className="flex items-center gap-2 border-l border-neutral-200 pl-2 sm:gap-2.5 sm:pl-3">
              <span className="max-w-[4.5rem] truncate text-sm text-neutral-600 sm:max-w-[12rem]">
                {profile.email}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-indigo-700 ring-1 ring-inset ring-indigo-200">
                {profile.role}
              </span>
              <form action="/auth/signout" method="post" className="shrink-0">
                <button
                  type="submit"
                  className="focus-ring tap-target text-sm text-neutral-500 hover:text-neutral-900"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className="focus-ring tap-target inline-flex items-center border-l border-neutral-200 pl-3 text-sm text-neutral-500 hover:text-neutral-900"
            >
              Log in
            </Link>
          )}
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="primary-nav-menu"
          aria-label="Primary"
          className="border-t border-neutral-200 bg-white px-4 py-2 md:hidden"
        >
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="focus-ring tap-target flex items-center rounded-md px-2 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
