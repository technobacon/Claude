export type MarketSide = "yes" | "no";

export interface PoolSplit {
  total: number;
  yesPercent: number;
  noPercent: number;
  isContested: boolean;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}

export function calculatePoolSplit(yesPool: number, noPool: number): PoolSplit {
  assertNonNegativeInteger(yesPool, "yesPool");
  assertNonNegativeInteger(noPool, "noPool");

  const total = yesPool + noPool;
  if (total === 0) {
    return { total: 0, yesPercent: 50, noPercent: 50, isContested: false };
  }

  const yesPercent = Math.round((yesPool / total) * 100);

  return {
    total,
    yesPercent,
    noPercent: 100 - yesPercent,
    isContested: yesPool > 0 && noPool > 0
  };
}

export function calculateProjectedPayout(
  stake: number,
  selectedPoolAfterStake: number,
  opposingPool: number
): number {
  assertNonNegativeInteger(stake, "stake");
  assertNonNegativeInteger(selectedPoolAfterStake, "selectedPoolAfterStake");
  assertNonNegativeInteger(opposingPool, "opposingPool");

  if (stake === 0 || selectedPoolAfterStake === 0) {
    return 0;
  }

  const payout = stake + (stake / selectedPoolAfterStake) * opposingPool;
  return Math.floor(payout);
}

export interface SettlementPosition {
  userId: string;
  stake: number;
}

export interface SettlementPayout extends SettlementPosition {
  payout: number;
}

/**
 * Allocates the complete pool using the largest-remainder method.
 * The result is deterministic and the sum of payouts always equals totalPool.
 */
export function allocateWinningPool(
  winners: SettlementPosition[],
  totalPool: number
): SettlementPayout[] {
  assertNonNegativeInteger(totalPool, "totalPool");

  if (winners.length === 0) {
    throw new RangeError("At least one winning position is required.");
  }

  for (const winner of winners) {
    assertNonNegativeInteger(winner.stake, `stake for ${winner.userId}`);
    if (winner.stake === 0) {
      throw new RangeError("Winning stakes must be positive.");
    }
  }

  const winningPool = winners.reduce((sum, winner) => sum + winner.stake, 0);
  if (totalPool < winningPool) {
    throw new RangeError("totalPool cannot be smaller than the winning pool.");
  }

  const provisional = winners.map((winner) => {
    const exact = (winner.stake / winningPool) * totalPool;
    const payout = Math.floor(exact);
    return { ...winner, payout, remainder: exact - payout };
  });

  let pointsLeft = totalPool - provisional.reduce((sum, winner) => sum + winner.payout, 0);
  const ranked = [...provisional].sort(
    (a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId)
  );

  for (let index = 0; pointsLeft > 0; index += 1, pointsLeft -= 1) {
    ranked[index % ranked.length].payout += 1;
  }

  return provisional.map(({ remainder: _remainder, ...winner }) => {
    void _remainder;
    const rankedWinner = ranked.find((candidate) => candidate.userId === winner.userId);
    return { ...winner, payout: rankedWinner?.payout ?? winner.payout };
  });
}
