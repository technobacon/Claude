"use client";

import { useActionState, useState } from "react";

import {
  commitPositionAction,
  type PositionActionState
} from "@/app/groups/[groupId]/markets/[marketId]/actions";
import {
  calculatePoolSplit,
  calculateProjectedPayout,
  type MarketSide
} from "@/lib/market-math";
import { formatPoints } from "@/lib/wallet/ledger";
import {
  clampStake,
  maxCommittablePoints,
  minCommittablePoints,
  type StakeLimits
} from "@/lib/positions/input";

type PositionFormProps = {
  balance: number;
  commitRequestId: string;
  existingPoints: number;
  existingSide: MarketSide | null;
  groupId: string;
  marketId: string;
  maxMarketStake: number;
  minimumPosition: number;
  noPool: number;
  yesPool: number;
};

const initialActionState: PositionActionState = {
  attempt: 0,
  error: "",
  nextCommitRequestId: null
};

export function PositionForm({
  balance,
  commitRequestId,
  existingPoints,
  existingSide,
  groupId,
  marketId,
  maxMarketStake,
  minimumPosition,
  noPool,
  yesPool
}: PositionFormProps) {
  const limits: StakeLimits = { balance, existingPoints, maxMarketStake, minimumPosition };
  const minimum = minCommittablePoints(limits);
  const maximum = maxCommittablePoints(limits);
  const canCommit = maximum >= minimum;

  const [side, setSide] = useState<MarketSide>(existingSide ?? "yes");
  const [stake, setStake] = useState(() => clampStake(minimum, limits));
  const [confirmedAttempt, setConfirmedAttempt] = useState<number | null>(null);
  const [state, formAction, isPending] = useActionState(
    commitPositionAction.bind(null, groupId, marketId),
    initialActionState
  );

  // Each failed attempt closes the confirmation sheet and rotates the
  // idempotency key, so an edited stake never reuses a spent request ID.
  const confirming = confirmedAttempt === state.attempt;
  const requestId = state.nextCommitRequestId ?? commitRequestId;

  const split = calculatePoolSplit(yesPool, noPool);
  const selectedPool = side === "yes" ? yesPool : noPool;
  const opposingPool = side === "yes" ? noPool : yesPool;
  const projectedPayout = calculateProjectedPayout(stake, selectedPool + stake, opposingPool);

  function selectStake(value: number) {
    setStake(clampStake(value, limits));
  }

  if (!canCommit) {
    return (
      <p className="info-banner" data-testid="position-unavailable">
        {balance < minimum
          ? `Committing here takes at least ${formatPoints(minimum)} points and your wallet holds ${formatPoints(balance)}.`
          : `You have reached the ${formatPoints(maxMarketStake)}-point cap for this market.`}
      </p>
    );
  }

  return (
    <form action={formAction} className="position-panel" data-testid="position-form">
      <input type="hidden" name="side" value={side} />
      <input type="hidden" name="points" value={stake} />
      <input type="hidden" name="commitRequestId" value={requestId} />

      <div className="odds-grid" aria-label="Choose a side">
        <button
          className={`outcome-card outcome-yes ${side === "yes" ? "selected" : ""}`}
          type="button"
          onClick={() => setSide("yes")}
          aria-pressed={side === "yes"}
          disabled={existingSide === "no" || isPending}
          data-testid="side-yes"
        >
          <span>YES</span>
          <strong>{split.yesPercent}%</strong>
        </button>
        <button
          className={`outcome-card outcome-no ${side === "no" ? "selected" : ""}`}
          type="button"
          onClick={() => setSide("no")}
          aria-pressed={side === "no"}
          disabled={existingSide === "yes" || isPending}
          data-testid="side-no"
        >
          <span>NO</span>
          <strong>{split.noPercent}%</strong>
        </button>
      </div>
      {existingSide ? (
        <p className="resolution-note">
          You already back {existingSide.toUpperCase()} with {formatPoints(existingPoints)} points. Positions cannot switch sides.
        </p>
      ) : null}

      <div className="form-field">
        <label className="field-label" htmlFor="stake-points">
          Points ({formatPoints(minimum)}–{formatPoints(maximum)}) · wallet {formatPoints(balance)}
        </label>
        <input
          id="stake-points"
          type="number"
          inputMode="numeric"
          min={minimum}
          max={maximum}
          step={1}
          value={stake}
          onChange={(event) => selectStake(Number(event.target.value))}
          disabled={isPending}
          data-testid="stake-input"
        />
        <input
          type="range"
          aria-label="Stake amount"
          min={minimum}
          max={maximum}
          step={1}
          value={stake}
          onChange={(event) => selectStake(Number(event.target.value))}
          disabled={isPending}
          data-testid="stake-slider"
        />
      </div>

      <div className="return-preview">
        <span>Estimated return if {side.toUpperCase()} wins</span>
        <strong data-testid="projected-payout">{formatPoints(projectedPayout)} pts</strong>
      </div>

      {state.error ? <p className="form-error" role="alert" data-testid="position-error">{state.error}</p> : null}

      {confirming ? (
        <div className="market-action-row" data-testid="confirm-sheet">
          <p className="resolution-note">
            Commit {formatPoints(stake)} points to {side.toUpperCase()}? Committed points stay in the pool until the market resolves; you can undo for a short window.
          </p>
          <button className={`commit-button commit-${side}`} type="submit" disabled={isPending} data-testid="confirm-commit">
            {isPending ? "Committing…" : `Confirm ${formatPoints(stake)} points on ${side.toUpperCase()}`}
          </button>
          <button className="ghost-button" type="button" onClick={() => setConfirmedAttempt(null)} disabled={isPending}>
            Back
          </button>
        </div>
      ) : (
        <button
          className={`commit-button commit-${side}`}
          type="button"
          onClick={() => setConfirmedAttempt(state.attempt)}
          data-testid="review-commit"
        >
          Review {formatPoints(stake)} points on {side.toUpperCase()}
        </button>
      )}
    </form>
  );
}
