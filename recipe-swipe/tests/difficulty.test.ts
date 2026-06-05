import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDifficulty } from "../src/core/difficulty.ts";

test("technique-first (no time): toss salad easy, braise hard", () => {
  assert.equal(computeDifficulty(10, "Toss the leaves and serve.").level, "easy");
  assert.equal(
    computeDifficulty(12, "Sear the lamb.\nBraise for 2 hours.\nReduce the sauce until thick.").level,
    "hard",
  );
});

test("time-first when minutes are known", () => {
  assert.equal(computeDifficulty(6, "Toss and serve.", 15, 2).level, "easy");
  assert.equal(computeDifficulty(12, "Sear then braise.", 90, 9).level, "hard");
  assert.equal(computeDifficulty(9, "Cook pasta. Combine.", 30, 5).level, "medium");
});
