import { describe, expect, it } from "vitest";

import {
  clampStake,
  maxCommittablePoints,
  minCommittablePoints,
  parsePositionInput,
  type StakeLimits
} from "@/lib/positions/input";

const REQUEST_ID = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

function stakeForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("side", "yes");
  formData.set("points", "50");
  formData.set("commitRequestId", REQUEST_ID);
  for (const [name, value] of Object.entries(overrides)) {
    formData.set(name, value);
  }
  return formData;
}

const openWallet: StakeLimits = {
  balance: 800,
  existingPoints: 0,
  maxMarketStake: 100,
  minimumPosition: 10
};

describe("parsePositionInput", () => {
  it("accepts a valid YES stake", () => {
    expect(parsePositionInput(stakeForm())).toEqual({
      data: { commitRequestId: REQUEST_ID, points: 50, side: "yes" },
      error: ""
    });
  });

  it("rejects a missing or unknown side", () => {
    expect(parsePositionInput(stakeForm({ side: "maybe" })).error).toMatch(/YES or NO/);
  });

  it.each(["0", "-25", "12.5", "1e2", " ", "fifty"])("rejects non-positive-integer points %j", (points) => {
    expect(parsePositionInput(stakeForm({ points })).error).toMatch(/whole number/);
  });

  it("rejects an invalid commit request id", () => {
    expect(parsePositionInput(stakeForm({ commitRequestId: "not-a-uuid" })).error).toMatch(/Refresh/);
  });
});

describe("stake limits", () => {
  it("caps the maximum stake at the wallet balance", () => {
    expect(maxCommittablePoints({ ...openWallet, balance: 30 })).toBe(30);
  });

  it("caps the maximum stake at the remaining per-market allowance", () => {
    expect(maxCommittablePoints({ ...openWallet, existingPoints: 80 })).toBe(20);
  });

  it("never returns a negative maximum", () => {
    expect(maxCommittablePoints({ ...openWallet, existingPoints: 100 })).toBe(0);
  });

  it("requires the season minimum for a first commitment", () => {
    expect(minCommittablePoints(openWallet)).toBe(10);
  });

  it("allows single-point top-ups once the minimum is met", () => {
    expect(minCommittablePoints({ ...openWallet, existingPoints: 10 })).toBe(1);
  });

  it("rejects invalid limit values", () => {
    expect(() => maxCommittablePoints({ ...openWallet, balance: -1 })).toThrow(RangeError);
    expect(() => minCommittablePoints({ ...openWallet, minimumPosition: 1.5 })).toThrow(RangeError);
  });
});

describe("clampStake", () => {
  it("clamps into the committable range and rounds to integers", () => {
    expect(clampStake(3, openWallet)).toBe(10);
    expect(clampStake(64.4, openWallet)).toBe(64);
    expect(clampStake(500, openWallet)).toBe(100);
    expect(clampStake(Number.NaN, openWallet)).toBe(10);
  });

  it("returns zero when no stake can satisfy the limits", () => {
    expect(clampStake(50, { ...openWallet, balance: 5 })).toBe(0);
  });
});
