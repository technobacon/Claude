"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { hashInvitationToken } from "@/lib/invitations/token";

export async function acceptInvitationAction(token: string) {
  const nextPath = `/invite/${token}`;
  const { supabase } = await requireUser(nextPath);
  const { data: groupId, error } = await supabase.rpc("accept_invitation", {
    invitation_token_hash: hashInvitationToken(token)
  });

  if (error || typeof groupId !== "string") {
    redirect(`${nextPath}?error=invalid`);
  }

  redirect(`/groups/${groupId}`);
}
