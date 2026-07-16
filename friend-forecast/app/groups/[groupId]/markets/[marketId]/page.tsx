import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { undoPositionAction } from "@/app/groups/[groupId]/markets/[marketId]/actions";
import { publishMarketAction } from "@/app/groups/[groupId]/markets/actions";
import { MarketRulesPreview } from "@/components/markets/market-rules-preview";
import { MarketShareLink } from "@/components/markets/market-share-link";
import { PositionForm } from "@/components/markets/position-form";
import { getAppUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/auth/require-user";
import { calculatePoolSplit, type MarketSide } from "@/lib/market-math";
import { hasUnresolvedMarketTokens, type MarketOutcomeControl, type MarketResolutionMode } from "@/lib/markets/input";
import { formatPoints } from "@/lib/wallet/ledger";

export const dynamic = "force-dynamic";

type MarketPageProps = {
  params: Promise<{ groupId: string; marketId: string }>;
  searchParams: Promise<{ committed?: string; created?: string; publish?: string; undo?: string; updated?: string }>;
};

type MarketDetail = {
  cancel_condition: string;
  creator: { display_name: string } | null;
  creator_can_participate: boolean;
  creator_user_id: string;
  first_stake_at: string | null;
  id: string;
  no_condition: string;
  outcome_control: MarketOutcomeControl;
  published_at: string | null;
  question: string;
  resolution_eligible_at: string;
  resolution_mode: MarketResolutionMode;
  resolution_source_text: string;
  resolution_source_url: string | null;
  rule_revision: number;
  rules_locked_at: string | null;
  season: { ends_at: string; starts_at: string; status: string } | { ends_at: string; starts_at: string; status: string }[] | null;
  status: string;
  timezone: string;
  trading_closes_at: string;
  yes_condition: string;
};

type MarketPools = {
  no_backers: number;
  no_pool: number;
  yes_backers: number;
  yes_pool: number;
};

type WalletSnapshot = {
  balance: number;
  max_market_stake: number;
  minimum_position: number;
};

type UserPosition = {
  points: number;
  side: MarketSide;
};

type UndoableTransaction = {
  id: string;
  points_delta: number;
  side: MarketSide;
  undo_expires_at: string | null;
};

export default async function MarketPage({ params, searchParams }: MarketPageProps) {
  const { groupId, marketId } = await params;
  const query = await searchParams;
  const { supabase, userId } = await requireUser(`/groups/${groupId}/markets/${marketId}`);
  const [
    { data: group, error: groupError },
    { data: marketData, error: marketError },
    { data: canCreate, error: permissionError },
    { data: poolsData, error: poolsError },
    { data: positionData, error: positionError },
    { data: walletData, error: walletError },
    { data: latestTransactions, error: transactionError }
  ] = await Promise.all([
    supabase.from("groups").select("id, name, accent_theme").eq("id", groupId).maybeSingle(),
    supabase
      .from("markets")
      .select("id, creator_user_id, question, yes_condition, no_condition, cancel_condition, resolution_source_text, resolution_source_url, trading_closes_at, resolution_eligible_at, timezone, resolution_mode, creator_can_participate, outcome_control, rule_revision, status, first_stake_at, rules_locked_at, published_at, creator:profiles!markets_creator_user_id_fkey(display_name), season:seasons!markets_season_id_fkey(status, starts_at, ends_at)")
      .eq("id", marketId)
      .eq("group_id", groupId)
      .maybeSingle(),
    supabase.rpc("can_create_market", { target_group_id: groupId }),
    supabase.from("market_pools").select("yes_pool, no_pool, yes_backers, no_backers").eq("market_id", marketId).maybeSingle(),
    supabase.from("positions").select("side, points").eq("market_id", marketId).eq("user_id", userId).gt("points", 0).maybeSingle(),
    supabase.rpc("get_wallet_snapshot", { target_group_id: groupId }),
    supabase
      .from("position_transactions")
      .select("id, side, points_delta, undo_expires_at")
      .eq("market_id", marketId)
      .eq("user_id", userId)
      .is("reversed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
  ]);

  if (groupError || marketError || permissionError || poolsError || positionError || walletError || transactionError) {
    throw new Error("The market could not be loaded.");
  }
  if (!group || !marketData) {
    notFound();
  }

  const market = marketData as unknown as MarketDetail;
  const pools = (poolsData as MarketPools | null) ?? { no_backers: 0, no_pool: 0, yes_backers: 0, yes_pool: 0 };
  const position = positionData as UserPosition | null;
  const wallet = ((walletData as WalletSnapshot[] | null) ?? [])[0] ?? null;
  const undoable = ((latestTransactions as UndoableTransaction[] | null) ?? [])[0] ?? null;
  const isCreator = market.creator_user_id === userId;
  const season = Array.isArray(market.season) ? market.season[0] : market.season;
  const now = new Date().valueOf();
  const seasonIsCurrent = season?.status === "active"
    && new Date(season.starts_at).valueOf() <= now
    && new Date(season.ends_at).valueOf() > now;
  const canEdit = isCreator && Boolean(canCreate) && seasonIsCurrent && ["draft", "open"].includes(market.status) && !market.first_stake_at;
  const hasUnresolvedTokens = hasUnresolvedMarketTokens({
    cancelCondition: market.cancel_condition,
    noCondition: market.no_condition,
    question: market.question,
    resolutionSourceText: market.resolution_source_text,
    yesCondition: market.yes_condition
  });
  const shareUrl = `${await getAppUrl()}/groups/${groupId}/markets/${marketId}`;

  const yesPool = Number(pools.yes_pool);
  const noPool = Number(pools.no_pool);
  const split = calculatePoolSplit(yesPool, noPool);
  const tradingOpen = market.status === "open" && new Date(market.trading_closes_at).valueOf() > now;
  const creatorLockedOut = isCreator && !market.creator_can_participate;
  const canStake = tradingOpen && seasonIsCurrent && !creatorLockedOut;
  const undoStillOpen = undoable !== null
    && undoable.undo_expires_at !== null
    && new Date(undoable.undo_expires_at).valueOf() > now
    && tradingOpen;
  const committedBanner = typeof query.committed === "string" && /^\d+-(yes|no)$/.test(query.committed)
    ? query.committed.split("-")
    : null;

  return (
    <main className={`page-shell dashboard-shell theme-${group.accent_theme}`}>
      <header className="topbar">
        <Link className="brand" href={`/groups/${groupId}`}>
          <span className="brand-mark" aria-hidden="true">FF</span>
          <span>{group.name}</span>
        </Link>
      </header>
      <section className="group-hero market-detail-hero">
        <span className="eyebrow">Created by {market.creator?.display_name ?? "a group member"} · revision {market.rule_revision}</span>
        <h1>{market.status === "draft" ? "Draft market." : "The group has a forecast."}</h1>
        <p>{market.rules_locked_at ? "The funded contract is immutable." : "Rules stay editable only until the first stake."}</p>
      </section>

      {query.created === "draft" || query.updated === "draft" ? <p className="info-banner" role="status">Completed draft saved. You and group admins can see it.</p> : null}
      {query.created === "publish" || query.updated === "publish" || query.publish === "published" ? <p className="success-banner" role="status">Market published. Its member-only link is ready to share.</p> : null}
      {query.publish === "unavailable" ? <p className="form-error" role="alert">The market could not be published. Check the deadline and group policy.</p> : null}
      {committedBanner ? <p className="success-banner" role="status">{formatPoints(Number(committedBanner[0]))} points committed to {committedBanner[1].toUpperCase()}. The market moved.</p> : null}
      {query.undo === "done" ? <p className="success-banner" role="status">Commitment undone. The points are back in your wallet.</p> : null}
      {query.undo === "unavailable" ? <p className="form-error" role="alert">That commitment could not be undone. The undo window may have closed.</p> : null}

      <MarketRulesPreview
        cancelCondition={market.cancel_condition}
        creatorCanParticipate={market.creator_can_participate}
        noCondition={market.no_condition}
        outcomeControl={market.outcome_control}
        question={market.question}
        resolutionEligibleAt={market.resolution_eligible_at}
        resolutionMode={market.resolution_mode}
        resolutionSourceText={market.resolution_source_text}
        resolutionSourceUrl={market.resolution_source_url}
        status={market.status}
        timezone={market.timezone}
        tradingClosesAt={market.trading_closes_at}
        yesCondition={market.yes_condition}
      />

      {market.status !== "draft" ? (
        <section className="dashboard-card" aria-label="Market pool">
          <span className="card-kicker">Pool split</span>
          {split.total === 0 ? (
            <p>No points are committed yet. The first stake locks the rules and starts the market.</p>
          ) : (
            <>
              <div className="odds-grid">
                <div className="outcome-card outcome-yes">
                  <span>YES</span>
                  <strong>{split.yesPercent}%</strong>
                  <small>{formatPoints(yesPool)} points · {Number(pools.yes_backers)} {Number(pools.yes_backers) === 1 ? "person" : "people"}</small>
                </div>
                <div className="outcome-card outcome-no">
                  <span>NO</span>
                  <strong>{split.noPercent}%</strong>
                  <small>{formatPoints(noPool)} points · {Number(pools.no_backers)} {Number(pools.no_backers) === 1 ? "person" : "people"}</small>
                </div>
              </div>
              <div className="pool-bar" aria-label={`${split.yesPercent}% yes and ${split.noPercent}% no`}>
                <span style={{ width: `${split.yesPercent}%` }} />
              </div>
              {!split.isContested ? (
                <p className="info-banner">Only one side is funded so far. If nobody takes the other side before the deadline, every stake is refunded.</p>
              ) : null}
            </>
          )}
          {position ? (
            <p className="resolution-note" data-testid="your-position">
              Your position: {formatPoints(position.points)} points on {position.side.toUpperCase()}.
            </p>
          ) : null}
          {undoable && undoStillOpen ? (
            <form action={undoPositionAction.bind(null, groupId, marketId, undoable.id, randomUUID())}>
              <button className="ghost-button" type="submit">
                Undo the last {formatPoints(undoable.points_delta)}-point commitment
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {market.status !== "draft" && canStake && wallet ? (
        <section className="dashboard-card" aria-label="Commit points">
          <span className="card-kicker">Take a side</span>
          <PositionForm
            balance={Number(wallet.balance)}
            commitRequestId={randomUUID()}
            existingPoints={position?.points ?? 0}
            existingSide={position?.side ?? null}
            groupId={groupId}
            marketId={marketId}
            maxMarketStake={Number(wallet.max_market_stake)}
            minimumPosition={Number(wallet.minimum_position)}
            noPool={noPool}
            yesPool={yesPool}
          />
        </section>
      ) : market.status !== "draft" && creatorLockedOut && tradingOpen ? (
        <p className="info-banner">You created this market without creator participation, so your wallet sits this one out.</p>
      ) : market.status === "open" && !tradingOpen ? (
        <p className="info-banner">The betting deadline has passed. New positions are no longer accepted.</p>
      ) : null}

      <section className="dashboard-card market-next-card">
        <span className="card-kicker">Market actions</span>
        {market.status === "draft" ? (
          <>
            <h2>Review before sharing.</h2>
            <p>Drafts are not shareable. Publish only when every threshold, source, and refund case is exact.</p>
          </>
        ) : (
          <>
            <h2>{market.first_stake_at ? "Rules locked by the first stake." : "Ready for positions."}</h2>
            <p>{market.first_stake_at ? "Committed points stay in the pool until the market resolves or refunds." : "The first committed stake makes this contract immutable."}</p>
            <MarketShareLink value={shareUrl} />
          </>
        )}
        {canEdit ? (
          <div className="market-action-row">
            <Link className="ghost-button button-link" href={`/groups/${groupId}/markets/${marketId}/edit`}>Edit rules</Link>
            {market.status === "draft" && !hasUnresolvedTokens ? (
              <form action={publishMarketAction.bind(null, groupId, marketId, market.rule_revision, randomUUID())}>
                <button className="primary-button" type="submit">Publish market</button>
              </form>
            ) : market.status === "draft" ? <span className="info-banner">Replace every template placeholder before publishing.</span> : null}
          </div>
        ) : isCreator && market.status === "draft" && !market.first_stake_at ? (
          <p className="info-banner">
            {seasonIsCurrent
              ? "The group creation policy no longer allows you to edit or publish this draft."
              : "This draft belongs to a season that is no longer active. Create a new market for the current season."}
          </p>
        ) : null}
      </section>
    </main>
  );
}
