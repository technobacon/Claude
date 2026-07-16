import { describe, expect, it } from "vitest";

import { countdownIntervalMs, formatTimeRemaining } from "@/lib/markets/countdown";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatTimeRemaining", () => {
  it("reports closed at and after the deadline", () => {
    expect(formatTimeRemaining(0)).toBe("Trading closed");
    expect(formatTimeRemaining(-5 * MINUTE)).toBe("Trading closed");
  });

  it("uses days and hours for far deadlines", () => {
    expect(formatTimeRemaining(2 * DAY + 4 * HOUR + 30 * MINUTE)).toBe("Closes in 2d 4h");
  });

  it("uses hours and minutes inside a day", () => {
    expect(formatTimeRemaining(2 * HOUR + 14 * MINUTE + 59 * SECOND)).toBe("Closes in 2h 14m");
  });

  it("uses minutes and seconds inside an hour", () => {
    expect(formatTimeRemaining(4 * MINUTE + 12 * SECOND)).toBe("Closes in 4m 12s");
  });

  it("counts whole seconds up in the final minute", () => {
    expect(formatTimeRemaining(45 * SECOND)).toBe("Closes in 45s");
    expect(formatTimeRemaining(500)).toBe("Closes in 1s");
  });

  it("handles invalid input", () => {
    expect(formatTimeRemaining(Number.NaN)).toBe("Deadline unavailable");
  });
});

describe("countdownIntervalMs", () => {
  it("ticks every second inside the final hour", () => {
    expect(countdownIntervalMs(30 * MINUTE)).toBe(SECOND);
  });

  it("ticks every minute outside the final hour", () => {
    expect(countdownIntervalMs(5 * HOUR)).toBe(MINUTE);
  });

  it("rarely ticks after the deadline or on bad input", () => {
    expect(countdownIntervalMs(-1)).toBe(HOUR);
    expect(countdownIntervalMs(Number.NaN)).toBe(HOUR);
  });
});
