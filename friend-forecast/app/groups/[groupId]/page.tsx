import Link from "next/link";
import { notFound } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireUser } from "@/lib/auth/require-user";
import { formatPoints } from "@/lib/wallet/ledger";
import { loadWallet } from "@/lib/wallet/read-model";

export const dynamic = "force-dynamic";

type GroupPageProps = {
  params: Promise<{ groupId: string }>;
};

type MemberRow = {
  joined_at: string;
  role: "owner" | "moderator" | "member";
  user_id: string;
  profile: { avatar_url: string | null; display_name: string } | null;
};

export default async function GroupPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const { supabase, userId } = await requireUser(`/groups/${groupId}`);
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, accent_theme, creation_policy")
    .eq("id", groupId)
    .maybeSingle();

  if (!group) {
    notFound();
  }

  const { data } = await supabase
    .from("group_memberships")
    .select("user_id, role, joined_at, profile:profiles!group_memberships_user_id_fkey(display_name, avatar_url)")
    .eq("group_id", groupId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  const members = (data ?? []) as unknown as MemberRow[];
  const currentMembership = members.find((member) => member.user_id === userId);
  let wallet = null;
  let walletError = false;
  try {
    wallet = await loadWallet(supabase, groupId, userId, 1);
  } catch {
    walletError = true;
  }

  return (
    <main className={`page-shell dashboard-shell theme-${group.accent_theme}`}>
      <header className="topbar">
        <Link className="brand" href="/groups">
          <span className="brand-mark" aria-hidden="true">FF</span>
          <span>All groups</span>
        </Link>
        <SignOutButton />
      </header>
      <section className="group-hero">
        <span className="eyebrow">Private group · {currentMembership?.role ?? "member"}</span>
        <h1>{group.name}</h1>
        <p>{members.length} {members.length === 1 ? "member" : "members"} · Market creation: {group.creation_policy}</p>
      </section>
      <div className="dashboard-grid">
        <section className="dashboard-card wallet-preview" aria-labelledby="wallet-heading">
          <span className="card-kicker">Your points</span>
          <h2 id="wallet-heading">{wallet ? `${formatPoints(wallet.balance)} points` : walletError ? "Wallet unavailable" : "No active season"}</h2>
          <p>{wallet ? `${wallet.seasonName} · ${wallet.activityCount} ledger entries` : "Wallet balances are derived from append-only activity."}</p>
          <Link className="text-link" href={`/groups/${groupId}/wallet`}>View wallet activity</Link>
        </section>
        <section className="dashboard-card" aria-labelledby="markets-heading">
          <span className="card-kicker">Forecasts</span>
          <h2 id="markets-heading">No markets yet</h2>
          <p>The group is ready. Structured market creation is the next core-loop milestone.</p>
          <button className="primary-button" disabled type="button">Create a market — coming next</button>
        </section>
        <section className="dashboard-card" aria-labelledby="members-heading">
          <span className="card-kicker">Roster</span>
          <h2 id="members-heading">Members</h2>
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.user_id}>
                <span className="member-avatar" aria-hidden="true">
                  {(member.profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
                </span>
                <span className="member-identity">
                  <strong>{member.profile?.display_name ?? "Forecaster"}</strong>
                  <small>{member.user_id === userId ? "You" : "Joined member"}</small>
                </span>
                <span className={`role-pill role-${member.role}`}>{member.role}</span>
              </li>
            ))}
          </ul>
          {currentMembership?.role === "owner" || currentMembership?.role === "moderator" ? (
            <Link className="text-link roster-action" href={`/groups/${groupId}/invites`}>Manage invitations</Link>
          ) : null}
        </section>
      </div>
    </main>
  );
}
