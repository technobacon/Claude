import type { MarketSide } from "@/lib/market-math";

export type PositionInput = {
  commitRequestId: string;
  points: number;
  side: MarketSide;
};

export type PositionInputResult =
  | { data: PositionInput; error: "" }
  | { data: null; error: string };

export type StakeLimits = {
  balance: number;
  existingPoints: number;
  maxMarketStake: number;
  minimumPosition: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertLimits({ balance, existingPoints, maxMarketStake, minimumPosition }: StakeLimits): void {
  for (const [label, value] of Object.entries({ balance, existingPoints, maxMarketStake, minimumPosition })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative integer.`);
    }
  }
}

/**
 * The largest additional stake the wallet and the per-market cap allow.
 * Zero means no further commitment is possible.
 */
export function maxCommittablePoints(limits: StakeLimits): number {
  assertLimits(limits);
  return Math.max(0, Math.min(limits.balance, limits.maxMarketStake - limits.existingPoints));
}

/**
 * The smallest additional stake that keeps the resulting position at or
 * above the season minimum. Top-ups after the minimum can be any size.
 */
export function minCommittablePoints(limits: StakeLimits): number {
  assertLimits(limits);
  return Math.max(1, limits.minimumPosition - limits.existingPoints);
}

export function clampStake(value: number, limits: StakeLimits): number {
  const maximum = maxCommittablePoints(limits);
  const minimum = minCommittablePoints(limits);
  if (maximum < minimum) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function parsePositionInput(formData: FormData): PositionInputResult {
  const side = formData.get("side");
  const pointsValue = formData.get("points");
  const commitRequestId = formData.get("commitRequestId");

  if (side !== "yes" && side !== "no") {
    return { data: null, error: "Choose YES or NO before committing points." };
  }

  const points = typeof pointsValue === "string" && /^\d+$/.test(pointsValue.trim())
    ? Number(pointsValue.trim())
    : Number.NaN;

  if (!Number.isSafeInteger(points) || points < 1) {
    return { data: null, error: "Stake a positive whole number of points." };
  }

  if (typeof commitRequestId !== "string" || !UUID_PATTERN.test(commitRequestId)) {
    return { data: null, error: "Refresh the market to start a valid commitment." };
  }

  return { data: { commitRequestId, points, side }, error: "" };
}
