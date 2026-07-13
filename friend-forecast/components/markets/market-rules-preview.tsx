type MarketRulesPreviewProps = {
  cancelCondition: string;
  creatorCanParticipate: boolean;
  noCondition: string;
  outcomeControl: "independent" | "creator_influenced" | "participant_influenced";
  question: string;
  resolutionEligibleAt: string;
  resolutionMode: "creator_final" | "disputable";
  resolutionSourceText: string;
  resolutionSourceUrl: string | null;
  status?: string;
  timezone: string;
  tradingClosesAt: string;
  yesCondition: string;
};

function formatMarketDate(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    return "Not set";
  }

  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function controlLabel(value: MarketRulesPreviewProps["outcomeControl"]) {
  if (value === "creator_influenced") return "Creator can influence result";
  if (value === "participant_influenced") return "Participants can influence result";
  return "Independent result";
}

export function MarketRulesPreview(props: MarketRulesPreviewProps) {
  return (
    <article className="market-rules-preview" aria-label="Market rules preview">
      <div className="market-preview-heading">
        <span className={`market-status market-status-${props.status ?? "preview"}`}>{props.status ?? "Preview"}</span>
        <span>Live points pool</span>
      </div>
      <h2>{props.question || "Your binary question"}</h2>
      <div className="rules-grid">
        <section className="rule-card rule-yes">
          <span>YES means</span>
          <p>{props.yesCondition || "Define the exact YES result."}</p>
        </section>
        <section className="rule-card rule-no">
          <span>NO means</span>
          <p>{props.noCondition || "Define the exact NO result."}</p>
        </section>
      </div>
      <section className="rule-card rule-cancel">
        <span>Cancel and refund if</span>
        <p>{props.cancelCondition || "Define when neither result should settle."}</p>
      </section>
      <dl className="market-contract-meta">
        <div>
          <dt>Trading closes</dt>
          <dd><time dateTime={props.tradingClosesAt}>{formatMarketDate(props.tradingClosesAt, props.timezone)}</time></dd>
        </div>
        <div>
          <dt>Earliest resolution</dt>
          <dd><time dateTime={props.resolutionEligibleAt}>{formatMarketDate(props.resolutionEligibleAt, props.timezone)}</time></dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>{props.timezone || "Not set"}</dd>
        </div>
        <div>
          <dt>Settlement</dt>
          <dd>{props.resolutionMode === "disputable" ? "Creator proposal + group dispute" : "Creator final"}</dd>
        </div>
        <div>
          <dt>Outcome control</dt>
          <dd>{controlLabel(props.outcomeControl)}</dd>
        </div>
        <div>
          <dt>Creator position</dt>
          <dd>{props.creatorCanParticipate ? "Allowed" : "Not allowed"}</dd>
        </div>
      </dl>
      <section className="market-source">
        <span>Evidence source</span>
        <p>{props.resolutionSourceText || "Name the agreed evidence."}</p>
        {props.resolutionSourceUrl ? (
          <a href={props.resolutionSourceUrl} rel="noreferrer" target="_blank">Open source</a>
        ) : null}
      </section>
    </article>
  );
}
