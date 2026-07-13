import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { publishMarketAction } from "@/app/groups/[groupId]/markets/actions";
import { MarketRulesPreview } from "@/components/markets/market-rules-preview";
import { MarketShareLink } from "@/components/markets/market-share-link";
import { getAppUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/auth/require-user";
import { hasUnresolvedMarketTokens, type MarketOutcomeControl, type MarketResolutionMode } from "@/lib/markets/input";

export const dynamic = "force-dynamic";

type MarketPageProps = {
  params: Promise<{ groupId: string; marketId: string }>;
  searchParams: Promise<{ created?: string; publish?: string; updated?: string }>;
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

export default async function MarketPage({ params, searchParams }: MarketPageProps) {
  const { groupId, marketId } = await params;
  const query = await searchParams;
  const { supabase, userId } = await requireUser(`/groups/${groupId}/markets/${marketId}`);
  const [
    { data: group, error: groupError },
    { data: marketData, error: marketError },
    { data: canCreate, error: permissionError }
  ] = await Promise.all([
    supabase.from("groups").select("id, name, accent_theme").eq("id", groupId).maybeSingle(),
    supabase
      .from("markets")
      .select("id, creator_user_id, question, yes_condition, no_condition, cancel_condition, resolution_source_text, resolution_source_url, trading_closes_at, resolution_eligible_at, timezone, resolution_mode, creator_can_participate, outcome_control, rule_revision, status, first_stake_at, rules_locked_at, published_at, creator:profiles!markets_creator_user_id_fkey(display_name), season:seasons!markets_season_id_fkey(status, starts_at, ends_at)")
      .eq("id", marketId)
      .eq("group_id", groupId)
      .maybeSingle(),
    supabase.rpc("can_create_market", { target_group_id: groupId })
  ]);

  if (groupError || marketError || permissionError) {
    throw new Error("The market could not be loaded.");
  }
  if (!group || !marketData) {
    notFound();
  }

  const market = marketData as unknown as MarketDetail;
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
            <p>YES/NO point commitment arrives in FF-009. This slice establishes the authoritative contract it will fund.</p>
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
