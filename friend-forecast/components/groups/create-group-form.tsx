"use client";

import { useActionState } from "react";

import { createGroupAction, type CreateGroupState } from "@/app/groups/actions";

const initialState: CreateGroupState = { error: "" };

export function CreateGroupForm() {
  const [state, formAction, isPending] = useActionState(createGroupAction, initialState);

  return (
    <form action={formAction} className="group-form">
      <div className="form-field">
        <label htmlFor="groupName">Group name</label>
        <input id="groupName" maxLength={80} name="name" placeholder="Sunday Crew" required type="text" />
      </div>
      <div className="form-field">
        <label htmlFor="accentTheme">Color theme</label>
        <select defaultValue="violet" id="accentTheme" name="accentTheme">
          <option value="violet">Violet</option>
          <option value="emerald">Emerald</option>
          <option value="coral">Coral</option>
          <option value="sky">Sky</option>
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="creationPolicy">Who can create markets?</label>
        <select defaultValue="members" id="creationPolicy" name="creationPolicy">
          <option value="members">Every member</option>
          <option value="moderators">Owners and moderators</option>
          <option value="owner">Owner only</option>
        </select>
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "Creating…" : "Create private group"}
      </button>
    </form>
  );
}
