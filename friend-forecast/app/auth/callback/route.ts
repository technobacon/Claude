import { NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }
  }

  const signInUrl = new URL("/auth/sign-in", requestUrl.origin);
  signInUrl.searchParams.set("error", "That sign-in link is invalid or has expired. Please request a new one.");
  signInUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(signInUrl);
}
