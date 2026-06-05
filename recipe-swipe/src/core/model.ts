/**
 * Canonical Recipe model — the contract between every source adapter and the
 * rest of the app. Adapters normalize *into* these shapes; the aggregator, API,
 * cache, and clients speak *only* these shapes. No vendor field ever leaks past
 * an adapter. See docs/03-data-model.md.
 */

export interface ImageRef {
  url: string;
  width?: number;
  height?: number;
}

export interface Ingredient {
  /** As written by the source, e.g. "2 cups flour". */
  raw: string;
  /** Parsed name, e.g. "flour" — the seed for the future pantry feature. */
  name?: string;
  quantity?: number;
  unit?: string;
}

export interface RecipeTags {
  diet: string[]; // canonical vocab: "vegetarian", "vegan", ...
  mealType: string[]; // "breakfast", "lunch", "dinner", ...
  cuisine: string[]; // "italian", "thai", ...
  intolerances: string[]; // allergens present / free-of
  mainIngredients: string[]; // incl. meat type: "chicken", "beef", "tofu", ...
}

export interface Rating {
  value: number;
  scale: number; // e.g. 5
  count?: number;
}

export interface Nutrition {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface Attribution {
  source: string; // adapter id
  publisher?: string; // display name
  url: string; // link target (== sourceUrl)
  requiredText?: string; // any mandated attribution string from the license
}

export type CachingPolicy = "yes" | "limited" | "no";

export interface Recipe {
  id: string; // our stable id (source + sourceRecipeId)
  source: string; // adapter id, e.g. "themealdb"
  sourceRecipeId: string; // id within that source
  sourceUrl: string; // ORIGINAL publisher page — the deep-link-out target
  publisher?: string;

  title: string;
  image?: ImageRef;
  description?: string; // short preview only — never full headnotes

  ingredients: Ingredient[];
  instructionsSummary?: string; // brief; FULL steps live on sourceUrl
  servings?: number;
  totalTimeMinutes?: number;

  tags: RecipeTags;
  rating?: Rating;
  nutrition?: Nutrition;
  difficulty?: "easy" | "medium" | "hard"; // derived; see core/difficulty.ts

  attribution: Attribution;
  fetchedAt: string; // ISO timestamp, for cache TTL
  cachingAllowed: CachingPolicy; // carried from the source license
}

export type SwipeDirection = "right" | "left";

/** Build the canonical id for a recipe from its source + source-local id. */
export function makeRecipeId(source: string, sourceRecipeId: string): string {
  return `${source}:${sourceRecipeId}`;
}

const EMPTY_TAGS: RecipeTags = {
  diet: [],
  mealType: [],
  cuisine: [],
  intolerances: [],
  mainIngredients: [],
};

/**
 * Validate that an object produced by an adapter satisfies the minimum a Recipe
 * needs to be usable. Returns the list of problems (empty == valid). Keep this
 * pure so adapters can be tested against fixtures without a browser/network.
 */
export function validateRecipe(r: Partial<Recipe>): string[] {
  const problems: string[] = [];
  if (!r.id) problems.push("missing id");
  if (!r.source) problems.push("missing source");
  if (!r.sourceUrl) problems.push("missing sourceUrl (needed for link-out)");
  if (!r.title) problems.push("missing title");
  if (!r.ingredients || r.ingredients.length === 0)
    problems.push("missing ingredients");
  if (!r.attribution || !r.attribution.url)
    problems.push("missing attribution.url");
  return problems;
}

/** Fill optional collections so consumers never deal with undefined. */
export function withDefaults(r: Recipe): Recipe {
  return {
    ...r,
    ingredients: r.ingredients ?? [],
    tags: { ...EMPTY_TAGS, ...r.tags },
  };
}
