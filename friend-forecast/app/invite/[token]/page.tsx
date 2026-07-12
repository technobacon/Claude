import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { hashInvitationToken } from "@/lib/invitations/token";
import { acceptInvitationAction } from "./actions";

export const dynamic = "force-dynamic";

type InvitePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

type InvitationPreview = {
  accent_theme: string;
  expires_at: string;
  group_id: string;
  group_name: string;
  market_question: string | null;
};

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: claimsData }] = await Promise.all([
    supabase.rpc("preview_invitation", { invitation_token_hash: hashInvitationToken(token) }),
    supabase.auth.getClaims()
  ]);
  const preview = ((data as InvitationPreview[] | null) ?? [])[0];
  const isSignedIn = Boolean(claimsData?.claims?.sub);
  const nextPath = `/invite/${token}`;

  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">FF</span>
        <span>Friend Forecast</span>
      </Link>
      <section className={`auth-card invite-preview ${preview ? `theme-${preview.accent_theme}` : ""}`}>
        {preview ? (
          <>
            <span className="eyebrow">Private invitation</span>
            <h1>{preview.group_name}</h1>
            <p className="auth-intro">
              You were invited to join a private Friend Forecast group.
              {preview.market_question ? ` The shared market is “${preview.market_question}”.` : ""}
            </p>
            {query.error ? <p className="form-error" role="alert">This invitation could not be accepted.</p> : null}
            {isSignedIn ? (
              <form action={acceptInvitationAction.bind(null, token)}>
                <button className="primary-button" type="submit">Join {preview.group_name}</button>
              </form>
            ) : (
              <Link className="primary-button" href={`/auth/sign-in?next=${encodeURIComponent(nextPath)}`}>
                Sign in to join
              </Link>
            )}
            <p className="auth-footnote">The link expires {new Date(preview.expires_at).toLocaleDateString()}.</p>
          </>
        ) : (
          <>
            <span className="eyebrow">Invitation unavailable</span>
            <h1>Link expired.</h1>
            <p className="auth-intro">This invitation is invalid, expired, revoked, or has reached its use limit.</p>
            <Link className="ghost-button" href="/">Return home</Link>
          </>
        )}
      </section>
    </main>
  );
}
