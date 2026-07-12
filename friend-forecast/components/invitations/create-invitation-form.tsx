"use client";

import { useActionState } from "react";

import { createInvitationAction, type InvitationActionState } from "@/app/groups/[groupId]/invites/actions";
import { ShareLink } from "./share-link";

const initialState: InvitationActionState = { error: "", inviteUrl: "" };

export function CreateInvitationForm({ groupId }: { groupId: string }) {
  const action = createInvitationAction.bind(null, groupId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="group-form">
      <div className="form-field">
        <label htmlFor="durationDays">Link duration</label>
        <select defaultValue="7" id="durationDays" name="durationDays">
          <option value="1">1 day</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="maximumUses">Maximum uses</label>
        <input id="maximumUses" max={100} min={1} name="maximumUses" placeholder="Unlimited" type="number" />
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "Creating…" : "Create invitation link"}
      </button>
      {state.inviteUrl ? <ShareLink value={state.inviteUrl} /> : null}
    </form>
  );
}
