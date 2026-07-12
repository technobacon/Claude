import { describe, expect, it } from "vitest";

import { coerceLedgerInteger, formatPoints, summarizeLedger, walletEntryLabel } from "./ledger";

describe("wallet ledger", () => {
  it("derives balance from append-only credits and debits", () => {
    expect(
      summarizeLedger([
        { amount: 1000, idempotencyKey: "opening", type: "opening_grant" },
        { amount: 200, idempotencyKey: "week-1", type: "weekly_grant" },
        { amount: -150, idempotencyKey: "position-1", type: "position_debit" },
        { amount: 50, idempotencyKey: "undo-1", type: "position_reversal" }
      ])
    ).toEqual({ activityCount: 4, balance: 1100, credits: 1250, debits: 150, isReconciled: true });
  });

  it("flags duplicate keys and invalid type signs", () => {
    expect(
      summarizeLedger([
        { amount: 100, idempotencyKey: "same", type: "opening_grant" },
        { amount: 25, idempotencyKey: "same", type: "position_debit" }
      ]).isReconciled
    ).toBe(false);
  });

  it("rejects fractional or unsafe point values", () => {
    expect(() => coerceLedgerInteger("1.5")).toThrow("safe integers");
    expect(() => coerceLedgerInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow("safe integers");
  });

  it("provides fixed user-facing labels and signed formatting", () => {
    expect(walletEntryLabel("settlement_credit")).toBe("Market payout");
    expect(formatPoints(1200, true)).toBe("+1,200");
    expect(formatPoints(-75, true)).toBe("−75");
  });
});
