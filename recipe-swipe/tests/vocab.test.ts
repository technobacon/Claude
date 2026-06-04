import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isKnownDiet,
  isKnownMainIngredient,
  toCanonical,
} from "../src/core/vocab.ts";

test("toCanonical normalizes casing and spacing", () => {
  assert.equal(toCanonical("mealType", "Breakfast"), "breakfast");
  assert.equal(toCanonical("diet", "Gluten Free"), "gluten-free");
  assert.equal(toCanonical("mainIngredients", "CHICKEN"), "chicken");
});

test("toCanonical returns undefined for unknown terms", () => {
  assert.equal(toCanonical("diet", "carnivore-extreme"), undefined);
  assert.equal(toCanonical("mealType", "second-breakfast"), undefined);
});

test("vocabulary membership helpers", () => {
  assert.ok(isKnownDiet("vegan"));
  assert.ok(!isKnownDiet("nonsense"));
  assert.ok(isKnownMainIngredient("tofu"));
});
