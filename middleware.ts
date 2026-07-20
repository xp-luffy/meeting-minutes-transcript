import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // Everything requires sign-in. The only public surfaces are the auth pages
  // themselves and /review/[token] — the anonymous confirmation link a
  // director opens from an email, which by design has no account.
  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/review") ||
    path.startsWith("/auth");

  if (!isPublic) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && anonKey) {
      try {
        const supabase = createServerClient(url, anonKey, {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet: CookieToSet[]) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            },
          },
        });

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return NextResponse.redirect(new URL("/login", request.url));
        }
      } catch {
        // Never let an auth hiccup crash the entire edge middleware.
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
