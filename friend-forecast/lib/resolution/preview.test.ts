import { describe, expect, it } from "vitest";

import { previewSettlementPayout } from "@/lib/resolution/preview";

describe("previewSettlementPayout", () => {
  // 300 YES / 200 NO, user holds 100 of the YES pool.
  it("previews the pari-mutuel share when the proposed outcome matches the side", () => {
    expect(previewSettlementPayout("yes", "yes", 100, 300, 200)).toBe(166);
    expect(previewSettlementPayout("no", "no", 200, 300, 200)).toBe(500);
  });

  it("previews zero when the proposed outcome loses the position", () => {
    expect(previewSettlementPayout("no", "yes", 100, 300, 200)).toBe(0);
    expect(previewSettlementPayout("yes", "no", 200, 300, 200)).toBe(0);
  });

  it("previews an exact refund for a cancellation", () => {
    expect(previewSettlementPayout("cancel", "yes", 100, 300, 200)).toBe(100);
    expect(previewSettlementPayout("cancel", "no", 200, 300, 200)).toBe(200);
  });

  it("previews nothing for a not-ready proposal", () => {
    expect(previewSettlementPayout("not_ready", "yes", 100, 300, 200)).toBe(0);
  });

  it("rejects invalid points", () => {
    expect(() => previewSettlementPayout("yes", "yes", -1, 300, 200)).toThrow(RangeError);
  });
});
