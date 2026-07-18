export type ResultCardInput = {
  /** Group name only when the group allows external sharing of it. */
  groupName: string | null;
  noPercent: number;
  outcome: "cancel" | "no" | "yes";
  question: string;
  totalPool: number;
  yesPercent: number;
};

function assertPercent(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be between 0 and 100.`);
  }
}

/**
 * Deliberately redacted share text. The input type is the whole redaction
 * boundary: member names, balances, individual positions, comments, and
 * evidence can never appear because the builder never receives them.
 */
export function buildResultCardText(input: ResultCardInput): string {
  assertPercent(input.yesPercent, "yesPercent");
  assertPercent(input.noPercent, "noPercent");
  if (!Number.isSafeInteger(input.totalPool) || input.totalPool < 0) {
    throw new RangeError("totalPool must be a non-negative integer.");
  }

  const question = input.question.trim();
  if (question.length < 1 || question.length > 240) {
    throw new RangeError("A market question between 1 and 240 characters is required.");
  }

  const lines = [
    input.groupName?.trim() ? `${input.groupName.trim()} · Friend Forecast` : "Friend Forecast",
    `“${question}”`,
    `Final pool split: ${input.yesPercent}% YES / ${input.noPercent}% NO`,
    input.outcome === "cancel"
      ? "Outcome: CANCELLED — every stake was refunded."
      : `Outcome: ${input.outcome.toUpperCase()}`,
    `${input.totalPool} points were on the line.`
  ];

  return lines.join("\n");
}
