import { describe, expect, it } from "vitest";

import { getMarketWarnings, isoToZonedLocal, parseMarketInput, zonedLocalToIso } from "./input";
import { MARKET_TEMPLATES } from "./templates";

const NOW = new Date("2026-07-12T10:00:00.000Z");

function marketForm(overrides: Record<string, string> = {}) {
  const values = {
    cancelCondition: "Cancel if the official result is unavailable after 24 hours.",
    creatorCanParticipate: "true",
    intent: "publish",
    noCondition: "NO if the official result records a finish after 18:00.",
    outcomeControl: "independent",
    question: "Will Team Violet finish by 18:00 on 13 July 2026?",
    resolutionEligibleLocal: "2026-07-13T20:00",
    resolutionMode: "disputable",
    resolutionSourceText: "The official event result page.",
    resolutionSourceUrl: "https://example.com/results",
    templateKey: "sports",
    timezone: "Europe/Budapest",
    tradingClosesLocal: "2026-07-13T18:00",
    yesCondition: "YES if the official result records a finish at or before 18:00.",
    ...overrides
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe("market input", () => {
  it("normalizes a complete contract and converts the selected timezone to exact instants", () => {
    const result = parseMarketInput(marketForm({ question: "  Will Team Violet finish by 18:00 on 13 July 2026?  " }), NOW);

    expect(result.data).toMatchObject({
      intent: "publish",
      question: "Will Team Violet finish by 18:00 on 13 July 2026?",
      resolutionEligibleAt: "2026-07-13T18:00:00.000Z",
      templateKey: "sports",
      timezone: "Europe/Budapest",
      tradingClosesAt: "2026-07-13T16:00:00.000Z"
    });
  });

  it.each([
    [{ yesCondition: "Same rule", noCondition: " same   rule " }, 2, "different outcomes"],
    [{ resolutionSourceUrl: "javascript:alert(1)" }, 2, "HTTP or HTTPS"],
    [{ resolutionSourceUrl: "https://." }, 2, "HTTP or HTTPS"],
    [{ timezone: "Mars/Olympus" }, 3, "IANA timezone"],
    [{ tradingClosesLocal: "2026-07-12T09:00", timezone: "UTC" }, 3, "future"],
    [{ resolutionEligibleLocal: "2026-07-13T17:00" }, 3, "before trading closes"],
    [{ intent: "settle" }, 4, "publishing settings"],
    [{ outcomeControl: "participant_influenced", resolutionMode: "creator_final", creatorCanParticipate: "false" }, 4, "group dispute"],
    [{ resolutionMode: "creator_final", creatorCanParticipate: "true" }, 4, "no creator stake"],
    [{ question: "Will {team} meet the official threshold tomorrow?" }, 4, "template placeholder"]
  ])("rejects an invalid contract", (overrides, step, message) => {
    const result = parseMarketInput(marketForm(overrides), NOW);
    expect(result.data).toBeNull();
    expect(result.step).toBe(step);
    expect(result.error).toContain(message);
  });

  it("rejects nonexistent and ambiguous daylight-saving wall times", () => {
    expect(zonedLocalToIso("2026-03-08T02:30", "America/New_York")).toBeNull();
    expect(zonedLocalToIso("2026-11-01T01:30", "America/New_York")).toBeNull();
    expect(zonedLocalToIso("2026-04-05T01:45", "Australia/Lord_Howe")).toBeNull();
    expect(isoToZonedLocal("2026-11-01T05:30:00.000Z", "America/New_York")).toBe("2026-11-01T01:30");
  });

  it("allows template placeholders in a completed draft but not a published market", () => {
    const result = parseMarketInput(marketForm({
      intent: "draft",
      noCondition: "NO if the result is outside {window}."
    }), NOW);
    expect(result.data?.intent).toBe("draft");
  });

  it("flags vague, unresolved, generic, and controlled contracts without rewriting them", () => {
    const warnings = getMarketWarnings({
      cancelCondition: "Cancel if unknown.",
      creatorCanParticipate: true,
      noCondition: "NO if the result is outside {window}.",
      outcomeControl: "participant_influenced",
      question: "Will {Sam} arrive around dinner?",
      resolutionSourceText: "we'll know",
      yesCondition: "YES if Sam arrives soon."
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "vague_wording",
      "placeholder",
      "measurement",
      "generic_source",
      "participant_control",
      "creator_control"
    ]);
  });

  it("finds unresolved tokens outside the question and YES rule", () => {
    const warnings = getMarketWarnings({
      cancelCondition: "Cancel if the source is unavailable after {window}.",
      creatorCanParticipate: false,
      noCondition: "NO if the official result is above the threshold.",
      outcomeControl: "independent",
      question: "Will the official score stay below ten points?",
      resolutionSourceText: "Name the agreed source.",
      yesCondition: "YES if the official result is below ten points."
    });
    expect(warnings.map((warning) => warning.code)).toContain("placeholder");
  });

  it("ships every documented template with distinct settlement rules", () => {
    expect(MARKET_TEMPLATES.map((template) => template.key)).toEqual([
      "custom",
      "flight",
      "arrival",
      "trip_budget",
      "sports",
      "tv_outcome",
      "group_challenge"
    ]);
    expect(MARKET_TEMPLATES.every((template) => new Set([
      template.yesCondition,
      template.noCondition,
      template.cancelCondition
    ]).size === 3)).toBe(true);
  });
});
