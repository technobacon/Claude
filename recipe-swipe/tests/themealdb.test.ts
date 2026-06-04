import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  TheMealDbSource,
  createTheMealDbSource,
} from "../src/core/sources/themealdb.ts";
import { validateRecipe } from "../src/core/model.ts";
import type { FetchLike } from "../src/core/sources/types.ts";

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/themealdb.meal.json", import.meta.url)),
    "utf8",
  ),
);
const meal = fixture.meals[0];

test("normalize() produces a valid canonical Recipe", () => {
  const src = createTheMealDbSource();
  const recipe = src.normalize(meal);
  assert.deepEqual(validateRecipe(recipe), []);
  assert.equal(recipe.id, "themealdb:52772");
  assert.equal(recipe.source, "themealdb");
  assert.equal(recipe.title, "Teriyaki Chicken Casserole");
  assert.equal(recipe.image?.url, meal.strMealThumb);
});

test("normalize() links OUT to the original publisher, not themealdb", () => {
  const recipe = createTheMealDbSource().normalize(meal);
  assert.equal(recipe.sourceUrl, "https://www.bunsinmyoven.com/teriyaki-chicken-casserole/");
  assert.equal(recipe.publisher, "bunsinmyoven.com");
  assert.equal(recipe.attribution.url, recipe.sourceUrl);
  assert.match(recipe.attribution.requiredText ?? "", /TheMealDB/);
});

test("normalize() falls back to a working link when no source url", () => {
  const recipe = createTheMealDbSource().normalize({
    ...meal,
    strSource: "",
  });
  assert.equal(recipe.sourceUrl, "https://www.themealdb.com/meal/52772");
  assert.equal(recipe.publisher, "TheMealDB");
});

test("normalize() extracts ingredients with parsed name/quantity/unit", () => {
  const recipe = createTheMealDbSource().normalize(meal);
  assert.equal(recipe.ingredients.length, 9); // 10th is empty
  const soy = recipe.ingredients[0];
  assert.equal(soy.name, "soy sauce");
  assert.equal(soy.raw, "3/4 cup soy sauce");
  assert.equal(soy.quantity, 0.75);
  assert.equal(soy.unit, "cup");
});

test("normalize() maps category/area/tags into canonical vocab", () => {
  const recipe = createTheMealDbSource().normalize(meal);
  assert.deepEqual(recipe.tags.mainIngredients, ["chicken"]); // from "Chicken" category
  assert.deepEqual(recipe.tags.cuisine, ["japanese"]); // from area
});

test("instructionsSummary is a preview, never the full method", () => {
  const recipe = createTheMealDbSource().normalize(meal);
  assert.ok(recipe.instructionsSummary);
  assert.ok(!recipe.instructionsSummary!.includes("Preheat oven"));
  assert.match(recipe.instructionsSummary!, /full method on source/);
});

test("search() uses injected fetch and hydrates filter results", async () => {
  const calls: string[] = [];
  const fakeFetch: FetchLike = async (url) => {
    calls.push(url);
    if (url.includes("filter.php")) {
      return okJson({ meals: [{ idMeal: "52772", strMeal: "x", strMealThumb: "y" }] });
    }
    if (url.includes("lookup.php")) {
      return okJson(fixture);
    }
    return okJson({ meals: null });
  };
  const src = new TheMealDbSource(fakeFetch);
  const results = await src.search({ diet: ["vegetarian"], limit: 5 });
  assert.equal(results.length, 1);
  const recipe = src.normalize(results[0]);
  assert.equal(recipe.ingredients.length, 9); // hydrated full detail
  assert.ok(calls.some((u) => u.includes("filter.php?c=Vegetarian")));
  assert.ok(calls.some((u) => u.includes("lookup.php")));
});

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}
