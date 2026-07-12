"use client";

import { useActionState } from "react";

import {
  revokeInvitationAction,
  rotateInvitationAction,
  type InvitationActionState
} from "@/app/groups/[groupId]/invites/actions";
import { ShareLink } from "./share-link";

const initialState: InvitationActionState = { error: "", inviteUrl: "" };

export function InvitationActions({ groupId, invitationId }: { groupId: string; invitationId: string }) {
  const [rotateState, rotateAction, isRotating] = useActionState(
    rotateInvitationAction.bind(null, groupId, invitationId),
    initialState
  );
  const [revokeState, revokeAction, isRevoking] = useActionState(
    revokeInvitationAction.bind(null, groupId, invitationId),
    initialState
  );

  return (
    <div className="invitation-actions">
      <form action={rotateAction}>
        <button className="ghost-button" disabled={isRotating || isRevoking} type="submit">
          {isRotating ? "Rotating…" : "Rotate"}
        </button>
      </form>
      <form action={revokeAction}>
        <button className="danger-button" disabled={isRotating || isRevoking} type="submit">
          {isRevoking ? "Revoking…" : "Revoke"}
        </button>
      </form>
      {rotateState.inviteUrl ? <ShareLink value={rotateState.inviteUrl} /> : null}
      {rotateState.error || revokeState.error ? (
        <p className="form-error" role="alert">{rotateState.error || revokeState.error}</p>
      ) : null}
    </div>
  );
}
