import { describe, expect, it } from "vitest";

import { decideVote, requiredQuorum, type VoteTally } from "@/lib/resolution/vote-math";

function tally(overrides: Partial<VoteTally> = {}): VoteTally {
  return { cancel: 0, no: 0, not_ready: 0, yes: 0, ...overrides };
}

describe("requiredQuorum", () => {
  it("requires half of eligible voters with a minimum of three", () => {
    expect(requiredQuorum(8)).toBe(4);
    expect(requiredQuorum(5)).toBe(3);
    expect(requiredQuorum(3)).toBe(3);
    expect(requiredQuorum(2)).toBe(3);
    expect(requiredQuorum(9)).toBe(5);
  });
});

describe("decideVote", () => {
  it("cancels without quorum", () => {
    expect(decideVote(8, tally({ yes: 3 }))).toEqual({ outcome: "cancel", reason: "no_quorum" });
  });

  // The documented example: eight eligible, five votes, 3/1/1 split.
  it("cancels when no option reaches two-thirds", () => {
    expect(decideVote(8, tally({ cancel: 1, no: 1, yes: 3 }))).toEqual({
      outcome: "cancel",
      reason: "no_consensus"
    });
  });

  it("decides at exactly two-thirds of cast votes", () => {
    expect(decideVote(5, tally({ no: 1, yes: 2 }))).toEqual({ outcome: "yes", reason: "decided" });
    expect(decideVote(8, tally({ no: 4, yes: 2 }))).toEqual({ outcome: "no", reason: "decided" });
  });

  it("lets NOT READY win and lets CANCEL win explicitly", () => {
    expect(decideVote(5, tally({ not_ready: 3, yes: 1 }))).toEqual({ outcome: "not_ready", reason: "decided" });
    expect(decideVote(5, tally({ cancel: 4 }))).toEqual({ outcome: "cancel", reason: "decided" });
  });

  it("never lets a small group below the minimum quorum settle", () => {
    expect(decideVote(2, tally({ yes: 2 }))).toEqual({ outcome: "cancel", reason: "no_quorum" });
  });

  it("rejects invalid tallies", () => {
    expect(() => decideVote(5, tally({ yes: -1 }))).toThrow(RangeError);
    expect(() => requiredQuorum(2.5)).toThrow(RangeError);
  });
});
