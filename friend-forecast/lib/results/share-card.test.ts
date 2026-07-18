import { describe, expect, it } from "vitest";

import { buildResultCardText, type ResultCardInput } from "@/lib/results/share-card";

function cardInput(overrides: Partial<ResultCardInput> = {}): ResultCardInput {
  return {
    groupName: null,
    noPercent: 40,
    outcome: "yes",
    question: "Will our flight leave the gate by 18:15?",
    totalPool: 133,
    yesPercent: 60,
    ...overrides
  };
}

describe("buildResultCardText", () => {
  it("builds a settled card with only the approved fields", () => {
    expect(buildResultCardText(cardInput())).toBe(
      [
        "Friend Forecast",
        "“Will our flight leave the gate by 18:15?”",
        "Final pool split: 60% YES / 40% NO",
        "Outcome: YES",
        "133 points were on the line."
      ].join("\n")
    );
  });

  it("includes the group name only when explicitly provided", () => {
    expect(buildResultCardText(cardInput({ groupName: "Budapest Crew" }))).toContain("Budapest Crew · Friend Forecast");
    expect(buildResultCardText(cardInput({ groupName: "  " }))).not.toContain("·");
  });

  it("describes a cancellation as a refund", () => {
    expect(buildResultCardText(cardInput({ outcome: "cancel" }))).toContain("CANCELLED — every stake was refunded.");
  });

  it("has exactly five lines and no room for member data", () => {
    const lines = buildResultCardText(cardInput({ groupName: "Crew" })).split("\n");
    expect(lines).toHaveLength(5);
    // The card is rebuilt only from the approved fields; nothing resembling
    // an email or balance line can appear.
    expect(lines.join("\n")).not.toMatch(/@|balance|wallet/i);
  });

  it("rejects invalid inputs", () => {
    expect(() => buildResultCardText(cardInput({ yesPercent: 101 }))).toThrow(RangeError);
    expect(() => buildResultCardText(cardInput({ totalPool: -1 }))).toThrow(RangeError);
    expect(() => buildResultCardText(cardInput({ question: "" }))).toThrow(RangeError);
  });
});
