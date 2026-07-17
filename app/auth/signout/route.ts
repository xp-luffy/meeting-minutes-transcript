import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /auth/signout — signs out the current session (server-side, clears
 * the auth cookies) then redirects home. Called from a plain form POST in
 * the header so it works without client-side JS.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
