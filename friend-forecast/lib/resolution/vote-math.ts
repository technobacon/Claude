import type { ResolutionOutcome } from "@/lib/resolution/input";

export type VoteTally = {
  cancel: number;
  no: number;
  not_ready: number;
  yes: number;
};

export type VoteDecision = {
  outcome: ResolutionOutcome;
  reason: "decided" | "no_consensus" | "no_quorum";
};

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}

/** At least half of eligible voters, never fewer than three votes. */
export function requiredQuorum(eligibleVoters: number): number {
  assertCount(eligibleVoters, "eligibleVoters");
  return Math.max(Math.ceil(eligibleVoters / 2), 3);
}

export function castVotes(tally: VoteTally): number {
  for (const [label, value] of Object.entries(tally)) {
    assertCount(value, label);
  }
  return tally.yes + tally.no + tally.cancel + tally.not_ready;
}

/**
 * Mirror of finalize_dispute_internal in PostgreSQL (which stays
 * authoritative): quorum first, then a two-thirds supermajority of cast
 * votes; anything less cancels and refunds. At most one option can reach
 * two-thirds, so the decision is deterministic.
 */
export function decideVote(eligibleVoters: number, tally: VoteTally): VoteDecision {
  const cast = castVotes(tally);

  if (cast < requiredQuorum(eligibleVoters)) {
    return { outcome: "cancel", reason: "no_quorum" };
  }

  const options: [ResolutionOutcome, number][] = [
    ["cancel", tally.cancel],
    ["no", tally.no],
    ["not_ready", tally.not_ready],
    ["yes", tally.yes]
  ];

  for (const [outcome, votes] of options) {
    if (votes * 3 >= cast * 2) {
      return { outcome, reason: "decided" };
    }
  }

  return { outcome: "cancel", reason: "no_consensus" };
}
