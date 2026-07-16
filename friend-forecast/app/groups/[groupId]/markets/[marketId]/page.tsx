import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { undoPositionAction } from "@/app/groups/[groupId]/markets/[marketId]/actions";
import { publishMarketAction } from "@/app/groups/[groupId]/markets/actions";
import { MarketLiveStatus } from "@/components/markets/market-live-status";
import { MarketRulesPreview } from "@/components/markets/market-rules-preview";
import { MarketShareLink } from "@/components/markets/market-share-link";
import { PositionForm } from "@/components/markets/position-form";
import { DisputeVoteForm, ResolutionDisputeForm, ResolutionProposalForm } from "@/components/markets/resolution-forms";
import { getAppUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/auth/require-user";
import { calculatePoolSplit, type MarketSide } from "@/lib/market-math";
import { hasUnresolvedMarketTokens, type MarketOutcomeControl, type MarketResolutionMode } from "@/lib/markets/input";
import {
  CREATOR_GRACE_HOURS,
  isResolutionOutcome,
  OUTCOME_LABELS,
  type ResolutionOutcome
} from "@/lib/resolution/input";
import { previewSettlementPayout } from "@/lib/resolution/preview";
import { formatPoints } from "@/lib/wallet/ledger";

export const dynamic = "force-dynamic";

type MarketPageProps = {
  params: Promise<{ groupId: string; marketId: string }>;
  searchParams: Promise<{ committed?: string; created?: string; disputed?: string; proposed?: string; publish?: string; undo?: string; updated?: string; voted?: string }>;
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

type ProposalRow = {
  challenge_deadline: string;
  created_at: string;
  evidence_url: string | null;
  explanation: string;
  id: string;
  outcome: string;
  proposer: { display_name: string } | { display_name: string }[] | null;
  status: string;
};

type DisputeRow = {
  created_at: string;
  disputer: { display_name: string } | { display_name: string }[] | null;
  evidence_url: string | null;
  final_outcome: string | null;
  final_reason: string | null;
  finalized_at: string | null;
  id: string;
  reason: string;
  vote_deadline: string;
  voters: { count: number }[] | null;
};

type VoteProgress = {
  eligible_voters: number;
  finalized_at: string | null;
  quorum: number;
  vote_deadline: string;
  votes_cast: number;
};

function displayName(value: { display_name: string } | { display_name: string }[] | null): string {
  const record = Array.isArray(value) ? value[0] : value;
  return record?.display_name ?? "a group member";
}

function formatInTimezone(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

export default async function MarketPage({ params, searchParams }: MarketPageProps) {
  const { groupId, marketId } = await params;
  const query = await searchParams;
  const { supabase, userId } = await requireUser(`/groups/${groupId}/markets/${marketId}`);

  // Opportunistic close and vote finalization: an expired market or an
  // expired dispute vote settles into its next state before the reads below
  // render it. Failures fall through — the membership-scoped reads below
  // decide what the caller sees.
  await supabase.rpc("close_market_if_due", { target_market_id: marketId });
  await supabase.rpc("finalize_dispute_if_due", { target_market_id: marketId });

  const [
    { data: group, error: groupError },
    { data: marketData, error: marketError },
    { data: canCreate, error: permissionError },
    { data: poolsData, error: poolsError },
    { data: positionData, error: positionError },
    { data: walletData, error: walletError },
    { data: latestTransactions, error: transactionError },
    { data: proposalData, error: proposalError },
    { data: disputeData, error: disputeError },
    { data: membershipData, error: membershipError }
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
      .limit(1),
    supabase
      .from("market_resolution_proposals")
      .select("id, outcome, explanation, evidence_url, challenge_deadline, status, created_at, proposer:profiles!market_resolution_proposals_proposer_user_id_fkey(display_name)")
      .eq("market_id", marketId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("market_disputes")
      .select("id, reason, evidence_url, vote_deadline, created_at, final_outcome, final_reason, finalized_at, disputer:profiles!market_disputes_disputer_user_id_fkey(display_name), voters:market_vote_snapshots(count)")
      .eq("market_id", marketId)
      .is("released_at", null)
      .maybeSingle(),
    supabase
      .from("group_memberships")
      .select("joined_at")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle()
  ]);

  if (groupError || marketError || permissionError || poolsError || positionError || walletError
    || transactionError || proposalError || disputeError || membershipError) {
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

  const latestProposal = (((proposalData as ProposalRow[] | null) ?? [])[0] ?? null);
  const dispute = disputeData as DisputeRow | null;
  const membership = membershipData as { joined_at: string } | null;
  const joinedBeforeDeadline = membership !== null
    && new Date(membership.joined_at).valueOf() < new Date(market.trading_closes_at).valueOf();
  const resolutionOpensAtMs = new Date(market.resolution_eligible_at).valueOf();
  const resolutionOpen = now >= resolutionOpensAtMs;
  const graceOver = now >= resolutionOpensAtMs + CREATOR_GRACE_HOURS * 3_600_000;
  const canPropose = market.status === "closed" && resolutionOpen && joinedBeforeDeadline && (isCreator || graceOver);
  const pendingProposal = market.status === "resolution_proposed" && latestProposal?.status === "pending" ? latestProposal : null;
  const challengeOpen = pendingProposal !== null && new Date(pendingProposal.challenge_deadline).valueOf() > now;
  const canDispute = challengeOpen && joinedBeforeDeadline && market.resolution_mode === "disputable";
  const proposalOutcome: ResolutionOutcome | null = pendingProposal && isResolutionOutcome(pendingProposal.outcome)
    ? pendingProposal.outcome
    : null;
  const payoutPreview = position && proposalOutcome
    ? previewSettlementPayout(proposalOutcome, position.side, position.points, yesPool, noPool)
    : null;
  const notReadyNote = market.status === "closed" && latestProposal?.outcome === "not_ready" && latestProposal.status === "accepted"
    ? latestProposal
    : null;
  const voterCount = dispute?.voters?.[0]?.count ?? 0;

  let voteProgress: VoteProgress | null = null;
  let myVoteChoice: string | null = null;
  let inVoterSnapshot = false;
  const finalTally: Record<string, number> = {};
  if (dispute && market.status === "disputed") {
    const [
      { data: progressData, error: progressError },
      { data: myVoteData, error: myVoteError },
      { data: snapshotData, error: snapshotError },
      { data: allVotesData, error: allVotesError }
    ] = await Promise.all([
      supabase.rpc("dispute_vote_progress", { target_dispute_id: dispute.id }),
      supabase.from("market_dispute_votes").select("choice").eq("dispute_id", dispute.id).eq("voter_user_id", userId).maybeSingle(),
      supabase.from("market_vote_snapshots").select("user_id").eq("dispute_id", dispute.id).eq("user_id", userId).maybeSingle(),
      dispute.finalized_at
        ? supabase.from("market_dispute_votes").select("choice").eq("dispute_id", dispute.id)
        : Promise.resolve({ data: null, error: null })
    ]);
    if (progressError || myVoteError || snapshotError || allVotesError) {
      throw new Error("The dispute vote could not be loaded.");
    }
    voteProgress = ((progressData as VoteProgress[] | null) ?? [])[0] ?? null;
    myVoteChoice = (myVoteData as { choice: string } | null)?.choice ?? null;
    inVoterSnapshot = snapshotData !== null;
    for (const vote of (allVotesData as { choice: string }[] | null) ?? []) {
      finalTally[vote.choice] = (finalTally[vote.choice] ?? 0) + 1;
    }
  }
  const voteOpen = dispute !== null
    && dispute.finalized_at === null
    && new Date(dispute.vote_deadline).valueOf() > now;

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
        <h1>
          {market.status === "draft" ? "Draft market."
            : market.status === "cancelled" ? "Market cancelled and refunded."
            : market.status === "closed" ? "Trading closed. The pool is locked."
            : market.status === "resolution_proposed" ? "An outcome is on the table."
            : market.status === "disputed" ? "The group is deciding."
            : "The group has a forecast."}
        </h1>
        <p>{market.rules_locked_at ? "The funded contract is immutable." : "Rules stay editable only until the first stake."}</p>
        {tradingOpen ? <MarketLiveStatus marketId={marketId} tradingClosesAt={market.trading_closes_at} /> : null}
      </section>

      {query.created === "draft" || query.updated === "draft" ? <p className="info-banner" role="status">Completed draft saved. You and group admins can see it.</p> : null}
      {query.created === "publish" || query.updated === "publish" || query.publish === "published" ? <p className="success-banner" role="status">Market published. Its member-only link is ready to share.</p> : null}
      {query.publish === "unavailable" ? <p className="form-error" role="alert">The market could not be published. Check the deadline and group policy.</p> : null}
      {committedBanner ? <p className="success-banner" role="status">{formatPoints(Number(committedBanner[0]))} points committed to {committedBanner[1].toUpperCase()}. The market moved.</p> : null}
      {query.undo === "done" ? <p className="success-banner" role="status">Commitment undone. The points are back in your wallet.</p> : null}
      {query.undo === "unavailable" ? <p className="form-error" role="alert">That commitment could not be undone. The undo window may have closed.</p> : null}
      {market.status === "closed" ? <p className="info-banner" role="status">Trading is closed. Committed points stay in the pool until the group resolves the outcome.</p> : null}
      {market.status === "cancelled" ? <p className="info-banner" role="status">This market ended without both sides funded, so every committed point was refunded.</p> : null}
      {query.proposed === "not_ready" ? <p className="success-banner" role="status">Recorded: the outcome is not decided yet. The market stays open for a later proposal.</p> : null}
      {query.proposed && query.proposed !== "not_ready" ? <p className="success-banner" role="status">Resolution proposed. The group can challenge it before it settles.</p> : null}
      {query.disputed === "opened" ? <p className="success-banner" role="status">Dispute opened. The proposal is paused for a hidden group vote.</p> : null}
      {query.voted === "1" ? <p className="success-banner" role="status">Vote recorded. It stays hidden until the vote finalizes.</p> : null}

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
              {!split.isContested && market.status === "open" ? (
                <p className="info-banner">Only one side is funded so far. If nobody takes the other side before the deadline, every stake is refunded.</p>
              ) : null}
            </>
          )}
          {position ? (
            <p className="resolution-note" data-testid="your-position">
              {market.status === "cancelled"
                ? `Your ${formatPoints(position.points)}-point ${position.side.toUpperCase()} stake was refunded to your wallet.`
                : `Your position: ${formatPoints(position.points)} points on ${position.side.toUpperCase()}.`}
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

      {["closed", "resolution_proposed", "disputed"].includes(market.status) ? (
        <section className="dashboard-card" aria-label="Resolution">
          <span className="card-kicker">Resolution</span>
          {market.status === "closed" ? (
            !resolutionOpen ? (
              <>
                <h2>Waiting for the event.</h2>
                <p>Resolution opens {formatInTimezone(market.resolution_eligible_at, market.timezone)} ({market.timezone}).</p>
              </>
            ) : (
              <>
                <h2>Propose the outcome.</h2>
                {notReadyNote ? (
                  <p className="info-banner" data-testid="not-ready-note">
                    {displayName(notReadyNote.proposer)} marked this market not ready on {formatInTimezone(notReadyNote.created_at, market.timezone)}: “{notReadyNote.explanation}”
                  </p>
                ) : null}
                {canPropose ? (
                  <>
                    <p>State the result exactly as the locked rules define it. Attach the agreed evidence source where you can.</p>
                    <ResolutionProposalForm groupId={groupId} marketId={marketId} requestId={randomUUID()} />
                  </>
                ) : (
                  <p className="info-banner">
                    {!joinedBeforeDeadline
                      ? "Only members who joined before the trading deadline can resolve this market."
                      : `The creator proposes first. Everyone else can propose ${CREATOR_GRACE_HOURS} hours after resolution opens.`}
                  </p>
                )}
              </>
            )
          ) : null}

          {pendingProposal ? (
            <div data-testid="proposal-card">
              <h2>{displayName(pendingProposal.proposer)} proposed {pendingProposal.outcome.toUpperCase()}.</h2>
              <p>“{pendingProposal.explanation}”</p>
              {pendingProposal.evidence_url ? (
                <p><a className="text-link" href={pendingProposal.evidence_url} rel="noreferrer" target="_blank">Open the evidence</a></p>
              ) : null}
              <p className="resolution-note">
                {challengeOpen
                  ? `Challenge window closes ${formatInTimezone(pendingProposal.challenge_deadline, market.timezone)} (${market.timezone}).`
                  : "The challenge window has closed. Settlement arrives in FF-013."}
              </p>
              {position && payoutPreview !== null ? (
                <p className="return-preview" data-testid="payout-preview">
                  <span>If this settles, your {formatPoints(position.points)}-point {position.side.toUpperCase()} stake returns</span>
                  <strong>{formatPoints(payoutPreview)} pts</strong>
                </p>
              ) : null}
              {canDispute ? (
                <ResolutionDisputeForm groupId={groupId} marketId={marketId} requestId={randomUUID()} />
              ) : market.resolution_mode !== "disputable" ? (
                <p className="info-banner">This market settles on its named source without a group dispute.</p>
              ) : !joinedBeforeDeadline ? (
                <p className="info-banner">Only members who joined before the trading deadline can dispute.</p>
              ) : null}
            </div>
          ) : null}

          {market.status === "disputed" && dispute ? (
            <div data-testid="dispute-card">
              <h2>{displayName(dispute.disputer)} disputed the proposal.</h2>
              <p>“{dispute.reason}”</p>
              {dispute.evidence_url ? (
                <p><a className="text-link" href={dispute.evidence_url} rel="noreferrer" target="_blank">Open the dispute evidence</a></p>
              ) : null}
              {dispute.finalized_at && dispute.final_outcome ? (
                <div data-testid="vote-result">
                  <p className="success-banner" role="status">
                    {dispute.final_reason === "no_quorum" ? "Too few members voted, so the market cancels and refunds."
                      : dispute.final_reason === "no_consensus" ? "No outcome reached two-thirds, so the market cancels and refunds."
                      : `The group decided ${dispute.final_outcome.replaceAll("_", " ").toUpperCase()}.`}
                  </p>
                  <p className="resolution-note">
                    Final tally: {Object.entries(finalTally).map(([choice, votes]) => `${choice.replaceAll("_", " ").toUpperCase()} ${votes}`).join(" · ") || "no votes cast"}
                    {" "}· {voteProgress ? `${voteProgress.votes_cast} of ${voteProgress.eligible_voters} eligible voters` : null}
                  </p>
                  <p>The settlement engine (FF-013) executes this outcome and moves the points.</p>
                </div>
              ) : (
                <>
                  <p className="resolution-note" data-testid="vote-progress">
                    {voteProgress ? `${voteProgress.votes_cast} of ${voteProgress.eligible_voters} hidden votes cast · quorum ${voteProgress.quorum}` : `${voterCount} eligible voters`}
                    {" "}· voting closes {formatInTimezone(dispute.vote_deadline, market.timezone)} ({market.timezone}).
                  </p>
                  {myVoteChoice ? (
                    <p className="info-banner" data-testid="my-vote">
                      Your hidden vote: {OUTCOME_LABELS[isResolutionOutcome(myVoteChoice) ? myVoteChoice : "yes"]}. The result appears when voting ends.
                    </p>
                  ) : voteOpen && inVoterSnapshot ? (
                    <DisputeVoteForm disputeId={dispute.id} groupId={groupId} marketId={marketId} requestId={randomUUID()} />
                  ) : (
                    <p className="info-banner">
                      {voteOpen
                        ? "Only members in the frozen voter snapshot can vote on this dispute."
                        : "Voting has closed. The result finalizes on the next page load."}
                    </p>
                  )}
                </>
              )}
            </div>
          ) : null}
        </section>
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
            <h2>
              {market.status === "cancelled" ? "Cancelled and refunded."
                : market.status === "closed" ? "Awaiting the outcome."
                : market.status === "resolution_proposed" ? "Proposal under review."
                : market.status === "disputed" ? "Group vote pending."
                : market.first_stake_at ? "Rules locked by the first stake."
                : "Ready for positions."}
            </h2>
            <p>
              {market.status === "cancelled" ? "Both sides never got funded before the deadline. Every stake went back to its wallet."
                : market.status === "closed" ? "Use the resolution panel above to propose the outcome once the event is decided."
                : market.status === "resolution_proposed" ? "The proposal stands unless someone disputes it before the challenge window closes."
                : market.status === "disputed" ? "A hidden one-person-one-vote decision picks YES, NO, CANCEL, or NOT READY."
                : market.first_stake_at ? "Committed points stay in the pool until the market resolves or refunds."
                : "The first committed stake makes this contract immutable."}
            </p>
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
