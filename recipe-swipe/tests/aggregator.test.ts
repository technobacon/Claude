import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeck,
  dedupe,
  excludeSwiped,
  fingerprint,
  matchesQuery,
  shuffle,
} from "../src/core/aggregator.ts";
import type { Recipe } from "../src/core/model.ts";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: overrides.id ?? "src:1",
    source: overrides.source ?? "src",
    sourceRecipeId: "1",
    sourceUrl: overrides.sourceUrl ?? "https://example.com/r/1",
    title: overrides.title ?? "Tomato Soup",
    image: overrides.image ?? { url: "https://img/1.jpg" },
    ingredients: overrides.ingredients ?? [
      { raw: "tomato", name: "tomato" },
      { raw: "salt", name: "salt" },
    ],
    tags: {
      diet: [],
      mealType: [],
      cuisine: [],
      intolerances: [],
      mainIngredients: [],
      ...overrides.tags,
    },
    attribution: { source: "src", url: "https://example.com/r/1" },
    fetchedAt: "2026-01-01T00:00:00.000Z",
    cachingAllowed: "yes",
    ...overrides,
  };
}

test("fingerprint matches the same dish across sources", () => {
  const a = recipe({ id: "a:1", source: "a", sourceUrl: "https://site.com/x" });
  const b = recipe({ id: "b:9", source: "b", sourceUrl: "https://www.site.com/x" });
  assert.equal(fingerprint(a), fingerprint(b));
});

test("dedupe keeps the richer record", () => {
  // Same dish from two sources (same title/ingredients/domain) — one is richer.
  const lean = recipe({ id: "a:1", image: undefined });
  const rich = recipe({
    id: "b:1",
    source: "b",
    rating: { value: 4.5, scale: 5 },
  });
  assert.equal(fingerprint(lean), fingerprint(rich)); // truly a duplicate
  const out = dedupe([lean, rich]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "b:1"); // richer (image + rating) wins
});

test("excludeSwiped removes already-seen recipes", () => {
  const out = excludeSwiped(
    [recipe({ id: "x" }), recipe({ id: "y" })],
    new Set(["x"]),
  );
  assert.deepEqual(out.map((r) => r.id), ["y"]);
});

test("matchesQuery applies diet + exclude filters", () => {
  const veg = recipe({ tags: { diet: ["vegetarian"], mealType: [], cuisine: [], intolerances: [], mainIngredients: [] } });
  assert.ok(matchesQuery(veg, { diet: ["vegetarian"], limit: 5 }));
  assert.ok(!matchesQuery(veg, { diet: ["vegan"], limit: 5 }));
  assert.ok(!matchesQuery(veg, { excludeIngredients: ["tomato"], limit: 5 }));
});

test("shuffle is deterministic given a seeded rand", () => {
  const seq = [0.9, 0.1, 0.5, 0.3];
  let i = 0;
  const rand = () => seq[i++ % seq.length];
  const a = shuffle([1, 2, 3, 4], rand);
  i = 0;
  const b = shuffle([1, 2, 3, 4], rand);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, [1, 2, 3, 4]);
});

test("buildDeck dedupes, excludes swiped, filters, and trims to limit", () => {
  const recipes = [
    recipe({ id: "a:1", title: "Veg Curry", tags: { diet: ["vegetarian"], mealType: [], cuisine: [], intolerances: [], mainIngredients: [] } }),
    recipe({ id: "b:1", source: "b", title: "Veg Curry", sourceUrl: "https://example.com/r/1", tags: { diet: ["vegetarian"], mealType: [], cuisine: [], intolerances: [], mainIngredients: [] } }), // dup of a:1
    recipe({ id: "c:1", title: "Beef Stew", sourceUrl: "https://x.com/2", tags: { diet: [], mealType: [], cuisine: [], intolerances: [], mainIngredients: ["beef"] } }),
    recipe({ id: "d:1", title: "Seen Salad", sourceUrl: "https://x.com/3", tags: { diet: ["vegetarian"], mealType: [], cuisine: [], intolerances: [], mainIngredients: [] } }),
  ];
  const deck = buildDeck(recipes, {
    query: { diet: ["vegetarian"], limit: 5 },
    swipedIds: new Set(["d:1"]),
    rand: () => 0, // stable order
  });
  const ids = deck.map((r) => r.id);
  assert.ok(!ids.includes("d:1")); // swiped
  assert.ok(!ids.includes("c:1")); // not vegetarian
  assert.equal(deck.length, 1); // a:1/b:1 collapsed to one
});
