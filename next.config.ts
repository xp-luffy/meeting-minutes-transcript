import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * `frame-ancestors 'none'` (+ the legacy X-Frame-Options) matters specifically
 * because /review/[token] is an anonymous, unauthenticated page carrying a
 * legally meaningful action ("I confirm these minutes are accurate"). Without
 * it that page can be framed and a signer clickjacked into confirming minutes
 * they never read. Production served only HSTS until 2026-07-18.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // Type errors DO block the build. This was previously `true`, which meant a
  // green build could not go red — the codebase typechecks clean (0 errors),
  // so suppressing it bought nothing while disabling the one check that works.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
