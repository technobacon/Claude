import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateInvitationForm } from "@/components/invitations/create-invitation-form";
import { InvitationActions } from "@/components/invitations/invitation-actions";
import { requireUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

type InvitationsPageProps = { params: Promise<{ groupId: string }> };

type InvitationRow = {
  created_at: string;
  expires_at: string;
  id: string;
  maximum_uses: number | null;
  revoked_at: string | null;
  uses: number;
};

export default async function InvitationsPage({ params }: InvitationsPageProps) {
  const { groupId } = await params;
  const { supabase } = await requireUser(`/groups/${groupId}/invites`);
  const [{ data: group }, { data: role }, { data }] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", groupId).maybeSingle(),
    supabase.rpc("group_role", { target_group_id: groupId }),
    supabase
      .from("invitations")
      .select("id, expires_at, maximum_uses, uses, revoked_at, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
  ]);

  if (!group || !["owner", "moderator"].includes(role ?? "")) {
    notFound();
  }

  const invitations = (data ?? []) as InvitationRow[];

  return (
    <main className="page-shell dashboard-shell">
      <header className="topbar">
        <Link className="brand" href={`/groups/${groupId}`}>
          <span className="brand-mark" aria-hidden="true">FF</span>
          <span>{group.name}</span>
        </Link>
      </header>
      <section className="dashboard-hero">
        <span className="eyebrow">Invitation controls</span>
        <h1>Bring in the crew.</h1>
        <p>Create expiring links, limit their uses, and revoke or rotate them whenever needed.</p>
      </section>
      <div className="dashboard-grid">
        <section className="dashboard-card" aria-labelledby="create-invite-heading">
          <span className="card-kicker">New link</span>
          <h2 id="create-invite-heading">Create invitation</h2>
          <CreateInvitationForm groupId={groupId} />
        </section>
        <section className="dashboard-card" aria-labelledby="active-invites-heading">
          <span className="card-kicker">Link history</span>
          <h2 id="active-invites-heading">Invitations</h2>
          {invitations.length ? (
            <ul className="invitation-list">
              {invitations.map((invitation) => {
                const expired = new Date(invitation.expires_at) <= new Date();
                const status = invitation.revoked_at ? "Revoked" : expired ? "Expired" : "Active";
                return (
                  <li key={invitation.id}>
                    <div>
                      <strong>{status}</strong>
                      <small>
                        {invitation.uses}/{invitation.maximum_uses ?? "∞"} uses · expires {new Date(invitation.expires_at).toLocaleDateString()}
                      </small>
                    </div>
                    {!invitation.revoked_at && !expired ? (
                      <InvitationActions groupId={groupId} invitationId={invitation.id} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : <p>No invitation links have been created.</p>}
        </section>
      </div>
    </main>
  );
}
