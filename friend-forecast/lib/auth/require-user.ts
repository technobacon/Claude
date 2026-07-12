import { redirect } from "next/navigation";

import { sanitizeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export async function requireUser(nextPath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    const destination = encodeURIComponent(sanitizeNextPath(nextPath));
    redirect(`/auth/sign-in?next=${destination}`);
  }

  return { supabase, userId };
}
