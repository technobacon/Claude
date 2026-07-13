import Link from "next/link";
import { notFound } from "next/navigation";

import { WalletActivityList } from "@/components/wallet/wallet-activity-list";
import { requireUser } from "@/lib/auth/require-user";
import { coerceLedgerInteger, formatPoints } from "@/lib/wallet/ledger";
import { loadWallet } from "@/lib/wallet/read-model";
import { applyWeeklyGrantsAction } from "./actions";

export const dynamic = "force-dynamic";

type WalletPageProps = {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ grant?: string }>;
};

type ReconciliationRow = {
  activity_count: number | string;
  balance: number | string;
  display_name: string;
  grant_receipts_ok: boolean;
  is_reconciled: boolean;
  nonnegative_balance: boolean;
  opening_grant_ok: boolean;
  season_id: string;
  user_id: string;
};

const seasonDate = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric"
});

export default async function WalletPage({ params, searchParams }: WalletPageProps) {
  const { groupId } = await params;
  const query = await searchParams;
  const { supabase, userId } = await requireUser(`/groups/${groupId}/wallet`);
  const [{ data: group }, { data: role }] = await Promise.all([
    supabase.from("groups").select("id, name, accent_theme").eq("id", groupId).maybeSingle(),
    supabase.rpc("group_role", { target_group_id: groupId })
  ]);

  if (!group) {
    notFound();
  }

  let wallet = null;
  let walletError = false;
  try {
    wallet = await loadWallet(supabase, groupId, userId);
  } catch {
    walletError = true;
  }

  const canReconcile = role === "owner" || role === "moderator";
  const { data: reconciliationData, error: reconciliationError } = canReconcile
    ? await supabase.rpc("reconcile_group_wallets", { target_group_id: groupId })
    : { data: null, error: null };
  const reconciliation = (reconciliationData ?? []) as ReconciliationRow[];

  return (
    <main className={`page-shell dashboard-shell theme-${group.accent_theme}`}>
      <header className="topbar">
        <Link className="brand" href={`/groups/${groupId}`}>
          <span className="brand-mark" aria-hidden="true">FF</span>
          <span>{group.name}</span>
        </Link>
      </header>
      <section className="group-hero wallet-hero">
        <span className="eyebrow">Append-only point ledger</span>
        <h1>Your wallet.</h1>
        <p>Every point is derived from immutable credits and debits—there is no editable balance.</p>
      </section>

      {query.grant === "applied" ? <p className="success-banner" role="status">Current weekly grants were applied.</p> : null}
      {query.grant === "current" ? <p className="info-banner" role="status">Every eligible wallet is already current.</p> : null}
      {query.grant === "unavailable" ? <p className="form-error" role="alert">Weekly grants are not due or could not be applied.</p> : null}

      {walletError ? (
        <section className="dashboard-card"><h2>Wallet unavailable</h2><p>The ledger could not be reconciled. Try again later.</p></section>
      ) : wallet ? (
        <>
          <section className="wallet-summary" aria-labelledby="wallet-balance-heading">
            <div>
              <span className="card-kicker">Available balance</span>
              <h2 id="wallet-balance-heading">{formatPoints(wallet.balance)} <small>points</small></h2>
              <p>{wallet.seasonName} · ends {seasonDate.format(new Date(wallet.endsAt))}</p>
            </div>
            <dl className="wallet-metrics">
              <div><dt>Weekly grant</dt><dd>{formatPoints(wallet.weeklyGrant)}</dd></div>
              <div><dt>Grant cap</dt><dd>{formatPoints(wallet.walletCap)}</dd></div>
              <div><dt>Max market stake</dt><dd>{formatPoints(wallet.maxMarketStake)}</dd></div>
              <div><dt>Minimum position</dt><dd>{formatPoints(wallet.minimumPosition)}</dd></div>
            </dl>
          </section>

          <div className="dashboard-grid wallet-grid">
            <section className="dashboard-card" aria-labelledby="activity-heading">
              <span className="card-kicker">History</span>
              <h2 id="activity-heading">Wallet activity</h2>
              {wallet.activityCount > wallet.activity.length ? (
                <p>Latest {wallet.activity.length} of {wallet.activityCount} entries.</p>
              ) : null}
              <WalletActivityList activity={wallet.activity} />
            </section>

            <section className="dashboard-card" aria-labelledby="season-heading">
              <span className="card-kicker">Season rules</span>
              <h2 id="season-heading">{wallet.seasonName}</h2>
              <p>Opening grant: {formatPoints(wallet.openingGrant)} points.</p>
              <p>
                {wallet.weeklyGrantProcessed
                  ? `This period credited ${formatPoints(wallet.weeklyGrantCredited)} points.`
                  : `Next scheduled boundary: ${seasonDate.format(new Date(wallet.nextWeeklyGrantAt))}.`}
              </p>
              {canReconcile ? (
                <form action={applyWeeklyGrantsAction.bind(null, groupId)}>
                  <button className="primary-button" disabled={!wallet.weeklyGrantDue || wallet.weeklyGrantProcessed} type="submit">
                    {wallet.weeklyGrantProcessed ? "Weekly grants applied" : "Apply due weekly grants"}
                  </button>
                </form>
              ) : null}
            </section>
          </div>

          {canReconcile ? (
            <section className="dashboard-card reconciliation-card" aria-labelledby="reconciliation-heading">
              <span className="card-kicker">Owner check</span>
              <h2 id="reconciliation-heading">Group reconciliation</h2>
              {reconciliationError ? <p className="form-error" role="alert">Group reconciliation is unavailable.</p> : (
                reconciliation.length ? (
                  <ul className="reconciliation-list">
                    {reconciliation.map((row) => (
                      <li key={`${row.user_id}:${row.season_id}`}>
                        <span><strong>{row.display_name}</strong><small>{formatPoints(coerceLedgerInteger(row.balance))} points · {coerceLedgerInteger(row.activity_count)} entries</small></span>
                        <span className={row.is_reconciled ? "reconciliation-ok" : "reconciliation-error"}>
                          {row.is_reconciled
                            ? "Reconciled"
                            : [
                                !row.opening_grant_ok ? "opening" : "",
                                !row.grant_receipts_ok ? "receipts" : "",
                                !row.nonnegative_balance ? "balance" : ""
                              ].filter(Boolean).join(", ") || "Review"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p>No wallets to reconcile.</p>
              )}
            </section>
          ) : null}
        </>
      ) : (
        <section className="dashboard-card"><h2>No active season</h2><p>This group does not have an active wallet season yet.</p></section>
      )}
    </main>
  );
}
