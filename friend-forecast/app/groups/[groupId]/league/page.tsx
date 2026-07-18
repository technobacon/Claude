import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { formatPoints } from "@/lib/wallet/ledger";

export const dynamic = "force-dynamic";

type LeaguePageProps = {
  params: Promise<{ groupId: string }>;
};

type StandingRow = {
  balance: number;
  display_name: string;
  market_net: number;
  markets_played: number;
  markets_won: number;
  member_role: string;
  staked_total: number;
  user_id: string;
};

type SeasonRow = {
  ends_at: string;
  name: string;
};

export default async function LeaguePage({ params }: LeaguePageProps) {
  const { groupId } = await params;
  const { supabase, userId } = await requireUser(`/groups/${groupId}/league`);

  const [
    { data: group, error: groupError },
    { data: standingsData, error: standingsError },
    { data: seasonData, error: seasonError },
    { data: canCreate, error: permissionError }
  ] = await Promise.all([
    supabase.from("groups").select("id, name, accent_theme").eq("id", groupId).maybeSingle(),
    supabase.rpc("get_group_standings", { target_group_id: groupId }),
    supabase
      .from("seasons")
      .select("name, ends_at")
      .eq("group_id", groupId)
      .eq("status", "active")
      .maybeSingle(),
    supabase.rpc("can_create_market", { target_group_id: groupId })
  ]);

  if (groupError || standingsError || seasonError || permissionError) {
    throw new Error("The league could not be loaded.");
  }
  if (!group) {
    notFound();
  }

  const standings = (standingsData as StandingRow[] | null) ?? [];
  const season = seasonData as SeasonRow | null;
  const seasonEnd = season
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(season.ends_at))
    : null;

  return (
    <main className={`page-shell dashboard-shell theme-${group.accent_theme}`}>
      <header className="topbar">
        <Link className="brand" href={`/groups/${groupId}`}>
          <span className="brand-mark" aria-hidden="true">FF</span>
          <span>{group.name}</span>
        </Link>
      </header>
      <section className="group-hero">
        <span className="eyebrow">{season ? `${season.name} · runs until ${seasonEnd}` : "No active season"}</span>
        <h1>The league table.</h1>
        <p>Net market profit ranks first — sitting on grants wins nothing here.</p>
      </section>

      <section className="dashboard-card" aria-label="Standings">
        <span className="card-kicker">Standings</span>
        {standings.length === 0 ? (
          <p>No active season standings yet. Create a market and get both sides funded.</p>
        ) : (
          <ol className="league-table" data-testid="league-table">
            {standings.map((row, index) => (
              <li key={row.user_id} className={row.user_id === userId ? "league-row league-row-self" : "league-row"}>
                <span className="league-rank" aria-hidden="true">{index + 1}</span>
                <span className="league-name">
                  {row.display_name}
                  {row.user_id === userId ? <small> (you)</small> : null}
                </span>
                <span className="league-record">
                  {row.markets_won}W · {Number(row.markets_played)} played · {formatPoints(Number(row.staked_total))} staked
                </span>
                <span className={Number(row.market_net) >= 0 ? "league-net amount-positive" : "league-net amount-negative"}>
                  {formatPoints(Number(row.market_net), true)}
                </span>
                <span className="league-balance">{formatPoints(Number(row.balance))} pts</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="dashboard-card market-next-card">
        <span className="card-kicker">Keep it moving</span>
        <h2>The table only changes when markets settle.</h2>
        <p>Someone has a flight to catch, a deadline to miss, or a match to lose. Put a number on it.</p>
        <div className="market-action-row">
          {canCreate ? (
            <Link className="primary-button button-link" href={`/groups/${groupId}/markets/new`}>Create the next market</Link>
          ) : null}
          <Link className="ghost-button button-link" href={`/groups/${groupId}`}>Back to the group</Link>
        </div>
      </section>
    </main>
  );
}
