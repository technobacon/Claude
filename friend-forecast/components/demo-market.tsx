"use client";

import { useMemo, useState } from "react";

import {
  calculatePoolSplit,
  calculateProjectedPayout,
  type MarketSide
} from "@/lib/market-math";

const STAKE_PRESETS = [25, 50, 100] as const;

export function DemoMarket() {
  const [yesPool, setYesPool] = useState(300);
  const [noPool, setNoPool] = useState(200);
  const [side, setSide] = useState<MarketSide>("yes");
  const [stake, setStake] = useState(50);
  const [message, setMessage] = useState("Choose a side and preview your position.");

  const split = useMemo(() => calculatePoolSplit(yesPool, noPool), [yesPool, noPool]);
  const selectedPool = side === "yes" ? yesPool : noPool;
  const opposingPool = side === "yes" ? noPool : yesPool;
  const projectedPayout = calculateProjectedPayout(stake, selectedPool + stake, opposingPool);

  function commitDemoPosition() {
    if (side === "yes") {
      setYesPool((pool) => pool + stake);
    } else {
      setNoPool((pool) => pool + stake);
    }

    setMessage(`${stake} demo points committed to ${side.toUpperCase()}. The market moved.`);
  }

  return (
    <article className="market-card">
      <div className="market-meta">
        <span>Budapest getaway</span>
        <span>Closes in 2h 14m</span>
      </div>

      <h3>Will our flight leave the gate by 18:15?</h3>
      <p className="resolution-note">
        Resolves using the airline&apos;s recorded gate-departure time. Cancelled flights resolve NO.
      </p>

      <div className="odds-grid" aria-label="Current market odds">
        <button
          className={`outcome-card outcome-yes ${side === "yes" ? "selected" : ""}`}
          type="button"
          onClick={() => setSide("yes")}
          aria-pressed={side === "yes"}
        >
          <span>YES</span>
          <strong>{split.yesPercent}%</strong>
          <small>{yesPool} points · 3 people</small>
        </button>
        <button
          className={`outcome-card outcome-no ${side === "no" ? "selected" : ""}`}
          type="button"
          onClick={() => setSide("no")}
          aria-pressed={side === "no"}
        >
          <span>NO</span>
          <strong>{split.noPercent}%</strong>
          <small>{noPool} points · 4 people</small>
        </button>
      </div>

      <div className="pool-bar" aria-label={`${split.yesPercent}% yes and ${split.noPercent}% no`}>
        <span style={{ width: `${split.yesPercent}%` }} />
      </div>

      <div className="position-panel">
        <div className="position-header">
          <div>
            <span className="field-label">Your position</span>
            <strong>{side.toUpperCase()}</strong>
          </div>
          <div className="return-preview">
            <span>Estimated return</span>
            <strong>{projectedPayout} pts</strong>
          </div>
        </div>

        <div className="stake-presets" aria-label="Choose demo stake">
          {STAKE_PRESETS.map((preset) => (
            <button
              className={stake === preset ? "active" : ""}
              type="button"
              key={preset}
              onClick={() => setStake(preset)}
              aria-pressed={stake === preset}
            >
              {preset}
            </button>
          ))}
        </div>

        <button className={`commit-button commit-${side}`} type="button" onClick={commitDemoPosition}>
          Commit {stake} points to {side.toUpperCase()}
        </button>
        <p className="demo-message" aria-live="polite">{message}</p>
      </div>
    </article>
  );
}
