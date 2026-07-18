"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/auth";
import { FOCUS_RING } from "@/components/ui";

interface NavLink {
  href: string;
  label: string;
}

/** A link is active when the pathname matches exactly, or (for non-root
 * links) is a nested route under it. */
function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Shared nav content rendered inside both the desktop sidebar and the
 * mobile drawer: wordmark, primary "New Meeting" action, the nav link
 * list, and the auth area pinned to the bottom via `mt-auto`.
 */
function SidebarContent({
  profile,
  links,
  pathname,
  onNavigate,
}: {
  profile: Profile | null;
  links: NavLink[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Link
        href="/"
        onClick={onNavigate}
        className={`${FOCUS_RING} truncate rounded-md text-base font-semibold tracking-tight text-neutral-900`}
      >
        Meeting Minutes
      </Link>

      <Link
        href="/meetings/new"
        onClick={onNavigate}
        className={`${FOCUS_RING} tap-target flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700`}
      >
        New Meeting
      </Link>

      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        {links.map((link) => {
          const active = isLinkActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`${FOCUS_RING} tap-target flex items-center rounded-md px-3 text-sm transition-colors ${
                active
                  ? "bg-indigo-50 font-medium text-indigo-700"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-neutral-200 pt-3">
        {profile ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className="min-w-0 flex-1 truncate text-sm text-neutral-600"
                title={profile.email ?? undefined}
              >
                {profile.email}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-indigo-700 ring-1 ring-inset ring-indigo-200">
                {profile.role}
              </span>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className={`${FOCUS_RING} tap-target text-sm text-neutral-500 hover:text-neutral-900`}
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            onClick={onNavigate}
            className={`${FOCUS_RING} tap-target flex items-center text-sm text-neutral-500 hover:text-neutral-900`}
          >
            Log in
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * App shell navigation: a fixed left sidebar on desktop (md and up), and a
 * sticky top bar + slide-in drawer on mobile. Both surfaces share the same
 * link list and auth area via `SidebarContent`.
 */
export function SiteHeader({ profile }: { profile: Profile | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes (client-side nav).
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

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!menuOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
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
    <>
      {/* Desktop: fixed left sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-20 md:flex md:w-60 md:flex-col md:overflow-y-auto md:border-r md:border-neutral-200 md:bg-white">
        <SidebarContent profile={profile} links={links} pathname={pathname} />
      </aside>

      {/* Mobile: sticky top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className={`${FOCUS_RING} tap-target -ml-2 inline-flex items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900`}
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
            className={`${FOCUS_RING} truncate rounded-md text-base font-semibold tracking-tight text-neutral-900`}
          >
            Meeting Minutes
          </Link>
        </div>

        <Link
          href="/meetings/new"
          aria-label="New Meeting"
          className={`${FOCUS_RING} tap-target inline-flex items-center justify-center rounded-md bg-indigo-600 px-3.5 text-base font-medium text-white transition-colors hover:bg-indigo-700`}
        >
          <span aria-hidden className="leading-none">
            +
          </span>
        </Link>
      </header>

      {/* Mobile: backdrop + slide-in drawer */}
      <div
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-30 bg-neutral-900/40 transition-opacity md:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Primary navigation"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[80vw] flex-col overflow-y-auto bg-white shadow-xl transition-transform duration-200 ease-in-out md:hidden"
        // Explicit inline transform rather than toggling Tailwind translate
        // utilities: v4 emits those via the CSS `translate` property, and the
        // off-canvas rule kept winning so the drawer never slid in (verified:
        // --tw-translate-x resolved to 0px while computed translate stayed
        // -100%). An inline transform is unambiguous and can't be overridden.
        style={{ transform: menuOpen ? "translateX(0)" : "translateX(-100%)" }}
      >
        <SidebarContent
          profile={profile}
          links={links}
          pathname={pathname}
          onNavigate={() => setMenuOpen(false)}
        />
      </div>
    </>
  );
}
