/**
 * Spoonacular adapter. Runs server-side only — the API key is injected from a
 * server env var and never reaches the client. Maps the canonical RecipeQuery to
 * Spoonacular's complexSearch and normalizes results (incl. cook time + derived
 * difficulty) into canonical Recipes. `normalize()` is pure (fixture-testable).
 */

import { computeDifficulty } from "../difficulty.ts";
import { makeRecipeId, type Ingredient, type Recipe, type RecipeTags } from "../model.ts";
import { toCanonical, type RecipeQuery } from "../vocab.ts";
import type { FetchLike, RawResult, RecipeSource, SourceCapabilities } from "./types.ts";

const BASE = "https://api.spoonacular.com";

// canonical diet -> Spoonacular diet value (omitted ones aren't Spoonacular diets)
const DIET_MAP: Record<string, string> = {
  vegetarian: "vegetarian", vegan: "vegan", pescatarian: "pescetarian",
  "gluten-free": "gluten free", keto: "ketogenic", paleo: "paleo", whole30: "whole30",
};
// canonical meal type -> Spoonacular dish "type" (single-valued per request)
const TYPE_MAP: Record<string, string> = {
  breakfast: "breakfast", brunch: "breakfast", lunch: "main course", dinner: "main course",
  snack: "snack", dessert: "dessert", appetizer: "appetizer", side: "side dish", drink: "drink",
};
const INTOLERANCE_MAP: Record<string, string> = { "tree-nut": "tree nut" };

const CAPABILITIES: SourceCapabilities = {
  filters: { diet: true, mealType: true, cuisine: true, intolerances: true, meatType: true, query: true },
  hasImages: true,
  hasRatings: false,
  hasReviewsText: false,
  hasNutrition: true,
  cachingAllowed: "limited", // confirm exact terms in Phase 0 (docs/05)
  attributionRequired: true,
};

interface SpoonRecipe {
  id: number;
  title: string;
  image?: string;
  sourceUrl?: string;
  spoonacularSourceUrl?: string;
  sourceName?: string;
  readyInMinutes?: number;
  servings?: number;
  cuisines?: string[];
  dishTypes?: string[];
  diets?: string[];
  instructions?: string;
  extendedIngredients?: { original?: string; name?: string; nameClean?: string }[];
  analyzedInstructions?: { steps?: { step: string }[] }[];
}

const stripHtml = (s?: string) => (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export class SpoonacularSource implements RecipeSource {
  readonly id = "spoonacular";
  readonly name = "Spoonacular";
  readonly capabilities = CAPABILITIES;

  #key: string;
  #fetch: FetchLike;

  constructor(apiKey: string, fetchImpl: FetchLike = fetch as unknown as FetchLike) {
    this.#key = apiKey;
    this.#fetch = fetchImpl;
  }

  async #get(path: string): Promise<unknown> {
    const sep = path.includes("?") ? "&" : "?";
    const res = await this.#fetch(`${BASE}/${path}${sep}apiKey=${encodeURIComponent(this.#key)}`);
    if (!res.ok) return null;
    return res.json();
  }

  #baseParams(query: RecipeQuery): URLSearchParams {
    const p = new URLSearchParams();
    p.set("addRecipeInformation", "true");
    p.set("fillIngredients", "true");
    p.set("instructionsRequired", "true");
    if (query.text) p.set("query", query.text);
    const diets = (query.diet ?? []).map((d) => DIET_MAP[d]).filter(Boolean);
    if (diets.length) p.set("diet", diets.join(",")); // AND
    if (query.cuisine?.length) p.set("cuisine", query.cuisine.join(",")); // OR
    const intol = (query.intolerances ?? []).map((i) => INTOLERANCE_MAP[i] ?? i);
    if (intol.length) p.set("intolerances", intol.join(","));
    if (query.includeIngredients?.length) p.set("includeIngredients", query.includeIngredients.join(","));
    if (query.excludeIngredients?.length) p.set("excludeIngredients", query.excludeIngredients.join(","));
    if (query.maxReadyMinutes) p.set("maxReadyTime", String(query.maxReadyMinutes));
    return p;
  }

  async search(query: RecipeQuery): Promise<RawResult[]> {
    const base = this.#baseParams(query);
    const number = Math.min(Math.max(query.limit || 12, 1), 20);
    const narrow = !!(query.diet?.length || query.cuisine?.length || query.maxReadyMinutes || query.mealType?.length || query.text);
    const types = (query.mealType ?? []).map((m) => TYPE_MAP[m]).filter(Boolean);
    const variants = types.length ? types : [undefined];

    const calls = variants.map((t) => {
      const p = new URLSearchParams(base);
      if (t) p.set("type", t);
      p.set("number", String(number));
      p.set("offset", String(Math.floor(Math.random() * (narrow ? 20 : 100))));
      return this.#get(`recipes/complexSearch?${p.toString()}`);
    });
    const datas = await Promise.all(calls);
    let results = datas.flatMap((d) => ((d as { results?: SpoonRecipe[] })?.results) ?? []);
    if (!results.length) {
      const p = new URLSearchParams(base);
      p.set("number", String(number));
      p.set("offset", "0");
      if (variants[0]) p.set("type", variants[0]!);
      const d = await this.#get(`recipes/complexSearch?${p.toString()}`);
      results = ((d as { results?: SpoonRecipe[] })?.results) ?? [];
    }
    return results;
  }

  async getById(sourceRecipeId: string): Promise<RawResult | null> {
    const d = await this.#get(`recipes/${encodeURIComponent(sourceRecipeId)}/information?includeNutrition=false`);
    return (d as SpoonRecipe) ?? null;
  }

  normalize(raw: RawResult): Recipe {
    const r = raw as SpoonRecipe;
    const seen = new Set<string>();
    const ingredients: Ingredient[] = [];
    for (const i of r.extendedIngredients ?? []) {
      const rawText = (i.original || i.name || "").trim();
      if (rawText && !seen.has(rawText.toLowerCase())) {
        seen.add(rawText.toLowerCase());
        ingredients.push({ raw: rawText, name: (i.nameClean || i.name || "").toLowerCase() });
      }
    }
    const sourceUrl = r.sourceUrl || r.spoonacularSourceUrl || `https://spoonacular.com/recipes/${slug(r.title)}-${r.id}`;
    let publisher = r.sourceName || "Spoonacular";
    if (!r.sourceName && r.sourceUrl) { try { publisher = new URL(r.sourceUrl).hostname.replace(/^www\./, ""); } catch { /* keep */ } }

    const stepObjs = r.analyzedInstructions?.[0]?.steps ?? [];
    const instrText = stripHtml(r.instructions) || stepObjs.map((s) => s.step).join(". ");
    const minutes = r.readyInMinutes || undefined;
    const dif = computeDifficulty(ingredients.length, instrText, minutes ?? null, stepObjs.length);

    const tags: RecipeTags = { diet: [], mealType: [], cuisine: [], intolerances: [], mainIngredients: [] };
    for (const c of r.cuisines ?? []) tags.cuisine.push(c.toLowerCase());
    for (const d of r.dishTypes ?? []) { const m = toCanonical("mealType", d); if (m && !tags.mealType.includes(m)) tags.mealType.push(m); }
    for (const d of r.diets ?? []) { const m = toCanonical("diet", d); if (m && !tags.diet.includes(m)) tags.diet.push(m); }

    return {
      id: makeRecipeId(this.id, String(r.id)),
      source: this.id,
      sourceRecipeId: String(r.id),
      sourceUrl,
      publisher,
      title: r.title,
      image: r.image ? { url: r.image } : undefined,
      ingredients,
      instructionsSummary: stepObjs.length ? `${stepObjs.length} steps — full method on source` : undefined,
      servings: r.servings,
      totalTimeMinutes: minutes,
      tags,
      difficulty: dif.level,
      attribution: { source: this.id, publisher, url: sourceUrl, requiredText: "Recipe data via Spoonacular" },
      fetchedAt: new Date().toISOString(),
      cachingAllowed: this.capabilities.cachingAllowed,
    };
  }
}

export function createSpoonacularSource(apiKey: string, fetchImpl?: FetchLike): SpoonacularSource {
  return new SpoonacularSource(apiKey, fetchImpl as FetchLike);
}
