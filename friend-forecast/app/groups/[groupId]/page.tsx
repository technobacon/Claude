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

type MarketRow = {
  id: string;
  question: string;
  status: string;
  timezone: string;
  trading_closes_at: string;
};

function canCreateMarket(policy: string, role: MemberRow["role"] | undefined) {
  if (!role) return false;
  if (policy === "members") return true;
  if (policy === "moderators") return role === "owner" || role === "moderator";
  return role === "owner";
}

function marketDeadline(market: MarketRow) {
  try {
    return new Intl.DateTimeFormat("en", {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      timeZone: market.timezone
    }).format(new Date(market.trading_closes_at));
  } catch {
    return new Date(market.trading_closes_at).toISOString();
  }
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const { supabase, userId } = await requireUser(`/groups/${groupId}`);
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, accent_theme, creation_policy")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    throw new Error("The group could not be loaded.");
  }
  if (!group) {
    notFound();
  }

  // Opportunistic close: reading the dashboard settles any market whose
  // deadline has passed before its list entry renders.
  await supabase.rpc("close_due_group_markets", { target_group_id: groupId });

  const now = new Date().toISOString();
  const [
    { data },
    { data: marketData, error: marketError },
    { data: activeSeason, error: seasonError }
  ] = await Promise.all([
    supabase
      .from("group_memberships")
      .select("user_id, role, joined_at, profile:profiles!group_memberships_user_id_fkey(display_name, avatar_url)")
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
    supabase
      .from("markets")
      .select("id, question, status, timezone, trading_closes_at")
      .eq("group_id", groupId)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("seasons")
      .select("id")
      .eq("group_id", groupId)
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .maybeSingle()
  ]);
  if (marketError || seasonError) {
    throw new Error("Markets could not be loaded.");
  }
  const members = (data ?? []) as unknown as MemberRow[];
  const markets = (marketData ?? []) as MarketRow[];
  const currentMembership = members.find((member) => member.user_id === userId);
  const canCreate = canCreateMarket(group.creation_policy, currentMembership?.role) && Boolean(activeSeason);
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
          <h2 id="markets-heading">{markets.length ? `${markets.length} recent ${markets.length === 1 ? "market" : "markets"}` : "No markets yet"}</h2>
          {markets.length ? (
            <ul className="group-market-list">
              {markets.map((market) => (
                <li key={market.id}>
                  <Link href={`/groups/${groupId}/markets/${market.id}`}>
                    <strong>{market.question}</strong>
                    <small>{market.status} · closes {marketDeadline(market)} · {market.timezone}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p>{activeSeason ? "Start with a question your group is already debating." : "An active season is required before creating a market."}</p>}
          {canCreate ? <Link className="primary-button button-link market-create-link" href={`/groups/${groupId}/markets/new`}>Create a market</Link> : null}
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
