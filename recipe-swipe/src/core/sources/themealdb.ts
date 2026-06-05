/**
 * TheMealDB adapter — our first, free source (great for proving the pipeline at
 * zero cost). Free to use with attribution. Docs: https://www.themealdb.com/api.php
 *
 * `normalize()` is pure (fixture-testable). Network access goes through an
 * injected FetchLike so tests pass a fake and stay deterministic.
 */

import { computeDifficulty } from "../difficulty.ts";
import {
  makeRecipeId,
  type Ingredient,
  type Recipe,
  type RecipeTags,
} from "../model.ts";
import { toCanonical, type RecipeQuery } from "../vocab.ts";
import type {
  FetchLike,
  RawResult,
  RecipeSource,
  SourceCapabilities,
} from "./types.ts";

const BASE = "https://www.themealdb.com/api/json/v1/1";

/** Shape of a full meal object as returned by search.php / lookup.php. */
interface RawMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  strTags?: string | null;
  strSource?: string | null;
  strYoutube?: string | null;
  [key: string]: unknown; // strIngredient1..20, strMeasure1..20
}

// TheMealDB categories that map onto our canonical meal types / diets.
const CATEGORY_FOR_MEALTYPE: Record<string, string> = {
  breakfast: "Breakfast",
  dessert: "Dessert",
  side: "Side",
  appetizer: "Starter",
};
const CATEGORY_FOR_DIET: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
};
// Meat types that exist as TheMealDB categories (others fall back to ingredient).
const CATEGORY_FOR_MEAT: Record<string, string> = {
  beef: "Beef",
  chicken: "Chicken",
  lamb: "Lamb",
  pork: "Pork",
  fish: "Seafood",
  shellfish: "Seafood",
};

const CAPABILITIES: SourceCapabilities = {
  filters: {
    diet: true, // only vegetarian/vegan via category
    mealType: true, // only a subset via category
    cuisine: true, // via "area"
    intolerances: false,
    meatType: true,
    query: true,
  },
  hasImages: true,
  hasRatings: false, // TheMealDB has no ratings
  hasReviewsText: false,
  hasNutrition: false,
  cachingAllowed: "yes", // free w/ attribution — confirm in Phase 0
  attributionRequired: true,
};

function nonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

/** Parse a TheMealDB measure like "2 cups" / "1/2 tsp" into quantity + unit. */
function parseMeasure(measure: string): { quantity?: number; unit?: string } {
  const m = measure.trim().match(/^([\d.]+(?:\s*\/\s*\d+)?)\s*(.*)$/);
  if (!m) return { unit: measure.trim() || undefined };
  let quantity: number | undefined;
  const num = m[1];
  if (num.includes("/")) {
    const [a, b] = num.split("/").map((x) => parseFloat(x));
    quantity = b ? a / b : undefined;
  } else {
    quantity = parseFloat(num);
  }
  const unit = m[2].trim() || undefined;
  return { quantity: Number.isFinite(quantity) ? quantity : undefined, unit };
}

function extractIngredients(meal: RawMeal): Ingredient[] {
  const out: Ingredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (!nonEmpty(name)) continue;
    const cleanName = (name as string).trim();
    const cleanMeasure = nonEmpty(measure) ? (measure as string).trim() : "";
    const { quantity, unit } = cleanMeasure
      ? parseMeasure(cleanMeasure)
      : {};
    out.push({
      raw: `${cleanMeasure} ${cleanName}`.trim(),
      name: cleanName.toLowerCase(),
      quantity,
      unit,
    });
  }
  return out;
}

function buildTags(meal: RawMeal): RecipeTags {
  const tags: RecipeTags = {
    diet: [],
    mealType: [],
    cuisine: [],
    intolerances: [],
    mainIngredients: [],
  };
  const category = nonEmpty(meal.strCategory) ? meal.strCategory : undefined;
  if (category) {
    const asMeal = toCanonical("mealType", category);
    if (asMeal) tags.mealType.push(asMeal);
    const asDiet = toCanonical("diet", category);
    if (asDiet) tags.diet.push(asDiet);
    const asMain = toCanonical("mainIngredients", category);
    if (asMain) tags.mainIngredients.push(asMain);
  }
  if (nonEmpty(meal.strArea)) tags.cuisine.push(meal.strArea.toLowerCase());
  if (nonEmpty(meal.strTags)) {
    for (const t of meal.strTags.split(",")) {
      for (const vocab of ["diet", "mealType", "mainIngredients"] as const) {
        const c = toCanonical(vocab, t);
        if (c && !tags[vocab].includes(c)) tags[vocab].push(c);
      }
    }
  }
  return tags;
}

function publisherFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export class TheMealDbSource implements RecipeSource {
  readonly id = "themealdb";
  readonly name = "TheMealDB";
  readonly capabilities = CAPABILITIES;

  #fetch: FetchLike;

  constructor(fetchImpl: FetchLike) {
    this.#fetch = fetchImpl;
  }

  async #get(path: string): Promise<RawMeal[]> {
    const res = await this.#fetch(`${BASE}/${path}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { meals: RawMeal[] | null };
    return data.meals ?? [];
  }

  /** Map a canonical query to the best single TheMealDB endpoint. */
  #endpointFor(query: RecipeQuery): { path: string; hydrate: boolean } {
    if (nonEmpty(query.text))
      return { path: `search.php?s=${encodeURIComponent(query.text)}`, hydrate: false };

    const diet = query.diet?.[0];
    if (diet && CATEGORY_FOR_DIET[diet])
      return { path: `filter.php?c=${CATEGORY_FOR_DIET[diet]}`, hydrate: true };

    const meal = query.mealType?.[0];
    if (meal && CATEGORY_FOR_MEALTYPE[meal])
      return { path: `filter.php?c=${CATEGORY_FOR_MEALTYPE[meal]}`, hydrate: true };

    const meat = query.includeIngredients?.[0] ?? query.text;
    const meatCat = meat ? CATEGORY_FOR_MEAT[meat.toLowerCase()] : undefined;
    if (meatCat) return { path: `filter.php?c=${meatCat}`, hydrate: true };

    const cuisine = query.cuisine?.[0];
    if (cuisine)
      return {
        path: `filter.php?a=${encodeURIComponent(
          cuisine.charAt(0).toUpperCase() + cuisine.slice(1),
        )}`,
        hydrate: true,
      };

    const ing = query.includeIngredients?.[0];
    if (ing)
      return { path: `filter.php?i=${encodeURIComponent(ing)}`, hydrate: true };

    return { path: "search.php?s=", hydrate: false };
  }

  async search(query: RecipeQuery): Promise<RawResult[]> {
    const { path, hydrate } = this.#endpointFor(query);
    let meals = await this.#get(path);
    meals = meals.slice(0, query.limit);
    if (hydrate) {
      // Filter endpoints return stubs (id/name/thumb only) — hydrate to full.
      const full = await Promise.all(
        meals.map((m) => this.getById(m.idMeal)),
      );
      return full.filter((m): m is RawMeal => m !== null);
    }
    return meals;
  }

  async getById(sourceRecipeId: string): Promise<RawResult | null> {
    const meals = await this.#get(
      `lookup.php?i=${encodeURIComponent(sourceRecipeId)}`,
    );
    return meals[0] ?? null;
  }

  normalize(raw: RawResult): Recipe {
    const meal = raw as RawMeal;
    const instructions = nonEmpty(meal.strInstructions)
      ? meal.strInstructions.trim()
      : undefined;
    // Always have a working link-out target.
    const sourceUrl = nonEmpty(meal.strSource)
      ? meal.strSource.trim()
      : `https://www.themealdb.com/meal/${meal.idMeal}`;
    const publisher = nonEmpty(meal.strSource)
      ? publisherFromUrl(meal.strSource) ?? "TheMealDB"
      : "TheMealDB";

    const ingredients = extractIngredients(meal);
    // No time field from TheMealDB → technique-first difficulty.
    const difficulty = computeDifficulty(ingredients.length, instructions ?? "").level;

    return {
      id: makeRecipeId(this.id, meal.idMeal),
      source: this.id,
      sourceRecipeId: meal.idMeal,
      sourceUrl,
      publisher,
      title: meal.strMeal,
      image: nonEmpty(meal.strMealThumb)
        ? { url: meal.strMealThumb }
        : undefined,
      // Preview only — the full method lives on sourceUrl (link-out).
      description: instructions ? truncate(instructions, 180) : undefined,
      ingredients,
      difficulty,
      instructionsSummary: instructions
        ? `${countSentences(instructions)} steps — full method on source`
        : undefined,
      tags: buildTags(meal),
      attribution: {
        source: this.id,
        publisher,
        url: sourceUrl,
        requiredText: "Recipe data courtesy of TheMealDB",
      },
      fetchedAt: new Date().toISOString(),
      cachingAllowed: this.capabilities.cachingAllowed,
    };
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`;
}

function countSentences(s: string): number {
  const n = s.split(/[.!?]\s+/).filter((x) => x.trim().length > 0).length;
  return Math.max(1, n);
}

/** Factory using the platform fetch (Node 18+/browser). */
export function createTheMealDbSource(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): TheMealDbSource {
  return new TheMealDbSource(fetchImpl);
}
