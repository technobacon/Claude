import Link from "next/link";

import { SignInForm } from "@/components/auth/sign-in-form";
import { sanitizeNextPath } from "@/lib/auth/redirect";

type SignInPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams;

  return (
    <main className="auth-page">
      <Link className="brand" href="/" aria-label="Friend Forecast home">
        <span className="brand-mark" aria-hidden="true">FF</span>
        <span>Friend Forecast</span>
      </Link>
      <section className="auth-card" aria-labelledby="sign-in-heading">
        <span className="eyebrow">Private by default</span>
        <h1 id="sign-in-heading">Join the forecast.</h1>
        <p className="auth-intro">Use a one-time email link to enter your private groups. No password or app install required.</p>
        <SignInForm initialError={parameters.error} nextPath={sanitizeNextPath(parameters.next)} />
      </section>
      <p className="auth-privacy">Your email is used for account access only. Private market text is never included in analytics.</p>
    </main>
  );
}
