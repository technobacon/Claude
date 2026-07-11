import { describe, expect, it } from "vitest";

import {
  allocateWinningPool,
  calculatePoolSplit,
  calculateProjectedPayout
} from "./market-math";

describe("calculatePoolSplit", () => {
  it("calculates the weighted market split", () => {
    expect(calculatePoolSplit(300, 200)).toEqual({
      total: 500,
      yesPercent: 60,
      noPercent: 40,
      isContested: true
    });
  });

  it("uses a neutral display for an empty market", () => {
    expect(calculatePoolSplit(0, 0)).toEqual({
      total: 0,
      yesPercent: 50,
      noPercent: 50,
      isContested: false
    });
  });

  it("rejects fractional pools", () => {
    expect(() => calculatePoolSplit(1.5, 2)).toThrow(RangeError);
  });
});

describe("calculateProjectedPayout", () => {
  it("shows the current pari-mutuel return", () => {
    expect(calculateProjectedPayout(100, 300, 200)).toBe(166);
  });
});

describe("allocateWinningPool", () => {
  it("pays out the full pool with deterministic integer rounding", () => {
    const payouts = allocateWinningPool(
      [
        { userId: "alex", stake: 100 },
        { userId: "bea", stake: 100 },
        { userId: "chen", stake: 100 }
      ],
      500
    );

    expect(payouts.reduce((sum, position) => sum + position.payout, 0)).toBe(500);
    expect(payouts.map((position) => position.payout)).toEqual([167, 167, 166]);
  });

  it("preserves proportionality across unequal winners", () => {
    const payouts = allocateWinningPool(
      [
        { userId: "large", stake: 200 },
        { userId: "small", stake: 100 }
      ],
      500
    );

    expect(payouts).toEqual([
      { userId: "large", stake: 200, payout: 333 },
      { userId: "small", stake: 100, payout: 167 }
    ]);
  });
});
