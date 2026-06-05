import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpoonacularSource } from "../src/core/sources/spoonacular.ts";
import { validateRecipe } from "../src/core/model.ts";
import type { FetchLike } from "../src/core/sources/types.ts";

const fixture = {
  id: 716429,
  title: "Pasta with Garlic and Scallions",
  image: "https://img.spoonacular.com/716429.jpg",
  sourceUrl: "https://example.com/pasta-garlic",
  sourceName: "Foodista",
  readyInMinutes: 45,
  servings: 2,
  cuisines: ["Italian"],
  dishTypes: ["lunch", "main course"],
  diets: ["vegetarian"],
  extendedIngredients: [
    { original: "1 cup pasta", nameClean: "pasta" },
    { original: "2 cloves garlic", name: "garlic" },
    { original: "1 cup pasta", nameClean: "pasta" }, // dup -> collapsed
  ],
  analyzedInstructions: [{ steps: [{ step: "Boil the pasta." }, { step: "Saute the garlic." }] }],
};

test("normalize() -> valid canonical Recipe with time + difficulty", () => {
  const recipe = createSpoonacularSource("k").normalize(fixture);
  assert.deepEqual(validateRecipe(recipe), []);
  assert.equal(recipe.id, "spoonacular:716429");
  assert.equal(recipe.source, "spoonacular");
  assert.equal(recipe.totalTimeMinutes, 45);
  assert.equal(recipe.ingredients.length, 2); // duplicate collapsed
  assert.ok(["easy", "medium", "hard"].includes(recipe.difficulty!));
});

test("normalize() deep-links to the publisher, not spoonacular", () => {
  const recipe = createSpoonacularSource("k").normalize(fixture);
  assert.equal(recipe.sourceUrl, "https://example.com/pasta-garlic");
  assert.equal(recipe.publisher, "Foodista");
  assert.equal(recipe.attribution.url, recipe.sourceUrl);
});

test("normalize() maps cuisines/diets into canonical tags", () => {
  const recipe = createSpoonacularSource("k").normalize(fixture);
  assert.ok(recipe.tags.cuisine.includes("italian"));
  assert.ok(recipe.tags.diet.includes("vegetarian"));
});

test("search() builds complexSearch with mapped filters via injected fetch", async () => {
  const urls: string[] = [];
  const fakeFetch: FetchLike = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ({ results: [fixture] }) };
  };
  const src = createSpoonacularSource("secret", fakeFetch);
  const out = await src.search({ diet: ["gluten-free"], cuisine: ["italian"], maxReadyMinutes: 30, limit: 10 });
  assert.equal(out.length, 1);
  const u = urls[0];
  assert.match(u, /complexSearch/);
  assert.match(u, /diet=gluten\+free/);     // canonical gluten-free -> "gluten free"
  assert.match(u, /maxReadyTime=30/);
  assert.match(u, /apiKey=secret/);
});
