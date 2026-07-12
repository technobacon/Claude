"use client";

import { type FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ProfileFormProps = {
  initialDisplayName: string;
  userId: string;
};

export function ProfileForm({ initialDisplayName, userId }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = displayName.trim();

    if (!normalizedName) {
      setMessage("Enter a display name.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: normalizedName, updated_at: new Date().toISOString() })
      .eq("id", userId);

    setMessage(error ? "Could not save your profile. Try again." : "Profile saved.");
    setIsSaving(false);
  }

  return (
    <form className="profile-form" onSubmit={saveProfile}>
      <div className="form-field">
        <label htmlFor="profileDisplayName">Display name</label>
        <input
          id="profileDisplayName"
          maxLength={60}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          type="text"
          value={displayName}
        />
      </div>
      <button className="primary-button" disabled={isSaving} type="submit">
        {isSaving ? "Saving…" : "Save profile"}
      </button>
      {message ? <p className="form-message" role="status">{message}</p> : null}
    </form>
  );
}
