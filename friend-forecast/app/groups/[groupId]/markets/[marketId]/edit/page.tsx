import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketWizard, type MarketWizardValues } from "@/components/markets/market-wizard";
import { requireUser } from "@/lib/auth/require-user";
import { isoToZonedLocal, type MarketOutcomeControl, type MarketResolutionMode, type MarketTemplateKey } from "@/lib/markets/input";

export const dynamic = "force-dynamic";

type EditMarketPageProps = {
  params: Promise<{ groupId: string; marketId: string }>;
};

type EditableMarket = {
  cancel_condition: string;
  creator_can_participate: boolean;
  creator_user_id: string;
  first_stake_at: string | null;
  id: string;
  no_condition: string;
  outcome_control: MarketOutcomeControl;
  question: string;
  resolution_eligible_at: string;
  resolution_mode: MarketResolutionMode;
  resolution_source_text: string;
  resolution_source_url: string | null;
  rule_revision: number;
  season: { ends_at: string; starts_at: string; status: string } | { ends_at: string; starts_at: string; status: string }[] | null;
  status: string;
  template_key: MarketTemplateKey;
  timezone: string;
  trading_closes_at: string;
  yes_condition: string;
};

export default async function EditMarketPage({ params }: EditMarketPageProps) {
  const { groupId, marketId } = await params;
  const { supabase, userId } = await requireUser(`/groups/${groupId}/markets/${marketId}/edit`);
  const [
    { data: group, error: groupError },
    { data: marketData, error: marketError },
    { data: canCreate, error: permissionError }
  ] = await Promise.all([
    supabase.from("groups").select("id, name, accent_theme").eq("id", groupId).maybeSingle(),
    supabase
      .from("markets")
      .select("id, creator_user_id, question, yes_condition, no_condition, cancel_condition, resolution_source_text, resolution_source_url, trading_closes_at, resolution_eligible_at, timezone, resolution_mode, creator_can_participate, outcome_control, template_key, rule_revision, status, first_stake_at, season:seasons!markets_season_id_fkey(status, starts_at, ends_at)")
      .eq("id", marketId)
      .eq("group_id", groupId)
      .maybeSingle(),
    supabase.rpc("can_create_market", { target_group_id: groupId })
  ]);

  if (groupError || marketError || permissionError) {
    throw new Error("The market draft could not be loaded.");
  }
  if (!group || !marketData) {
    notFound();
  }

  const market = marketData as unknown as EditableMarket;
  if (market.creator_user_id !== userId) {
    notFound();
  }

  const season = Array.isArray(market.season) ? market.season[0] : market.season;
  const now = new Date().valueOf();
  const seasonIsCurrent = season?.status === "active"
    && new Date(season.starts_at).valueOf() <= now
    && new Date(season.ends_at).valueOf() > now;
  const editable = canCreate && seasonIsCurrent && ["draft", "open"].includes(market.status) && !market.first_stake_at;
  const seasonEndsAt = season?.ends_at;
  const initialValues: MarketWizardValues = {
    cancelCondition: market.cancel_condition,
    creatorCanParticipate: market.creator_can_participate,
    noCondition: market.no_condition,
    outcomeControl: market.outcome_control,
    question: market.question,
    resolutionEligibleLocal: isoToZonedLocal(market.resolution_eligible_at, market.timezone),
    resolutionMode: market.resolution_mode,
    resolutionSourceText: market.resolution_source_text,
    resolutionSourceUrl: market.resolution_source_url ?? "",
    templateKey: market.template_key,
    timezone: market.timezone,
    tradingClosesLocal: isoToZonedLocal(market.trading_closes_at, market.timezone),
    yesCondition: market.yes_condition
  };

  return (
    <main className={`page-shell dashboard-shell theme-${group.accent_theme}`}>
      <header className="topbar">
        <Link className="brand" href={`/groups/${groupId}/markets/${marketId}`}>
          <span className="brand-mark" aria-hidden="true">FF</span>
          <span>Market details</span>
        </Link>
      </header>
      <section className="group-hero market-create-hero">
        <span className="eyebrow">Rule revision {market.rule_revision} · {market.status}</span>
        <h1>{market.status === "draft" ? "Edit the draft." : "Revise before the first stake."}</h1>
        <p>Saving an open market returns it to a private draft until you publish the reviewed rules again.</p>
      </section>
      {editable ? (
        <MarketWizard
          groupId={groupId}
          initialValues={initialValues}
          marketId={marketId}
          requestIds={{ creation: randomUUID(), mutation: randomUUID(), publish: randomUUID() }}
          revision={market.rule_revision}
          seasonEndsAt={seasonEndsAt}
        />
      ) : (
        <section className="dashboard-card permission-card">
          <span className="card-kicker">{!canCreate ? "Creation policy" : !seasonIsCurrent ? "Season ended" : market.first_stake_at ? "Rules locked" : "Market state"}</span>
          <h2>{!canCreate ? "You no longer have edit permission." : !seasonIsCurrent ? "This market’s season is no longer active." : "This market cannot be edited."}</h2>
          <p>
            {!canCreate
              ? "The group creation policy changed after this market was created."
              : !seasonIsCurrent
                ? "Drafts and unfunded markets cannot move into a different season silently. Create a new market for the current season."
              : "Rule editing is unavailable. Funded-market cancellation and refund controls arrive with the position workflow."}
          </p>
          <Link className="text-link" href={`/groups/${groupId}/markets/${marketId}`}>View immutable rules</Link>
        </section>
      )}
    </main>
  );
}
