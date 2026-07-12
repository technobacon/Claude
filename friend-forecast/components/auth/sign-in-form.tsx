"use client";

import { type FormEvent, useState } from "react";

import { createAuthCallbackUrl } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

type SignInFormProps = {
  initialError?: string;
  nextPath: string;
};

export function SignInForm({ initialError, nextPath }: SignInFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError ?? "");
  const [sentTo, setSentTo] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: displayName ? { display_name: displayName } : undefined,
          emailRedirectTo: createAuthCallbackUrl(window.location.origin, nextPath)
        }
      });

      if (error) {
        throw error;
      }

      setSentTo(email);
    } catch {
      setErrorMessage("We could not send the sign-in email. Check the address and try again in a minute.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div className="auth-success" role="status">
        <span className="auth-success-mark" aria-hidden="true">✓</span>
        <h2>Check your inbox</h2>
        <p>We sent a one-time sign-in link to <strong>{sentTo}</strong>.</p>
        <button className="ghost-button" type="button" onClick={() => setSentTo("")}>
          Use another email
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="displayName">Display name</label>
        <input
          autoComplete="name"
          id="displayName"
          name="displayName"
          placeholder="What your friends call you"
          type="text"
          maxLength={60}
        />
        <small>Used when creating a new account. You can change it later.</small>
      </div>
      <div className="form-field">
        <label htmlFor="email">Email address</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </div>
      {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="auth-footnote">No password. The link expires after one hour and can only be used once.</p>
    </form>
  );
}
