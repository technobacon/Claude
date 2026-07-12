"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { getAppUrl } from "@/lib/app-url";
import { parseInvitationInput } from "@/lib/invitations/input";
import { createInvitationToken, hashInvitationToken } from "@/lib/invitations/token";

export type InvitationActionState = {
  error: string;
  inviteUrl: string;
};

const failureState: InvitationActionState = { error: "The invitation could not be updated.", inviteUrl: "" };

async function shareUrl(token: string) {
  return `${await getAppUrl()}/invite/${token}`;
}

export async function createInvitationAction(
  groupId: string,
  _previousState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const input = parseInvitationInput(formData);

  if (!input.data) {
    return { error: input.error, inviteUrl: "" };
  }

  const { supabase } = await requireUser(`/groups/${groupId}/invites`);
  const token = createInvitationToken();
  const { error } = await supabase.rpc("create_invitation", {
    target_group_id: groupId,
    invitation_token_hash: hashInvitationToken(token),
    target_market_id: null,
    invitation_expires_at: input.data.expiresAt,
    invitation_maximum_uses: input.data.maximumUses
  });

  if (error) {
    return failureState;
  }

  revalidatePath(`/groups/${groupId}/invites`);
  return { error: "", inviteUrl: await shareUrl(token) };
}

export async function revokeInvitationAction(
  groupId: string,
  invitationId: string,
  _previousState: InvitationActionState
): Promise<InvitationActionState> {
  void _previousState;
  const { supabase } = await requireUser(`/groups/${groupId}/invites`);
  const { error } = await supabase.rpc("revoke_invitation", { target_invitation_id: invitationId });

  if (error) {
    return failureState;
  }

  revalidatePath(`/groups/${groupId}/invites`);
  return { error: "", inviteUrl: "" };
}

export async function rotateInvitationAction(
  groupId: string,
  invitationId: string,
  _previousState: InvitationActionState
): Promise<InvitationActionState> {
  void _previousState;
  const { supabase } = await requireUser(`/groups/${groupId}/invites`);
  const token = createInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error } = await supabase.rpc("rotate_invitation", {
    target_invitation_id: invitationId,
    replacement_token_hash: hashInvitationToken(token),
    replacement_expires_at: expiresAt,
    replacement_maximum_uses: null
  });

  if (error) {
    return failureState;
  }

  revalidatePath(`/groups/${groupId}/invites`);
  return { error: "", inviteUrl: await shareUrl(token) };
}
