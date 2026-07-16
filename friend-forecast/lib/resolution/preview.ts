import { calculateProjectedPayout, type MarketSide } from "@/lib/market-math";
import type { ResolutionOutcome } from "@/lib/resolution/input";

/**
 * Estimated payout for one position if the proposed outcome settles.
 * Uses the same proportional formula as the settlement engine; the final
 * integer allocation may differ by at most the largest-remainder points.
 */
export function previewSettlementPayout(
  outcome: ResolutionOutcome,
  side: MarketSide,
  points: number,
  yesPool: number,
  noPool: number
): number {
  if (!Number.isSafeInteger(points) || points < 0) {
    throw new RangeError("points must be a non-negative integer.");
  }

  if (outcome === "cancel") {
    return points;
  }

  if (outcome === "not_ready") {
    return 0;
  }

  if (outcome !== side) {
    return 0;
  }

  const winningPool = side === "yes" ? yesPool : noPool;
  const losingPool = side === "yes" ? noPool : yesPool;
  return calculateProjectedPayout(points, winningPool, losingPool);
}
