/**
 * Canonical filter vocabularies. The app speaks ONE vocabulary; each source
 * adapter maps these terms to/from its vendor's parameter names and values.
 * See docs/03-data-model.md.
 */

export const DIETS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "keto",
  "paleo",
  "low-carb",
  "whole30",
] as const;

export const MEAL_TYPES = [
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "appetizer",
  "side",
  "drink",
] as const;

export const INTOLERANCES = [
  "dairy",
  "egg",
  "gluten",
  "peanut",
  "tree-nut",
  "soy",
  "shellfish",
  "fish",
  "wheat",
  "sesame",
] as const;

/** Includes meat types, per the product brief's "specific meat types" filter. */
export const MAIN_INGREDIENTS = [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "turkey",
  "fish",
  "shellfish",
  "tofu",
  "beans",
  "eggs",
  "cheese",
  "rice",
  "pasta",
] as const;

export type Diet = (typeof DIETS)[number];
export type MealType = (typeof MEAL_TYPES)[number];
export type Intolerance = (typeof INTOLERANCES)[number];
export type MainIngredient = (typeof MAIN_INGREDIENTS)[number];

/** A normalized feed request. Adapters translate this to vendor params. */
export interface RecipeQuery {
  text?: string;
  diet?: string[];
  mealType?: string[];
  cuisine?: string[];
  intolerances?: string[];
  excludeIngredients?: string[];
  /** Basis for the pantry feature later (Phase 4). */
  includeIngredients?: string[];
  /** Cap on total cook time in minutes (Spoonacular: maxReadyTime). */
  maxReadyMinutes?: number;
  /** Filter by derived difficulty (client-side post-filter). */
  difficulty?: string[];
  limit: number;
  cursor?: string;
}

const KNOWN = {
  diet: new Set<string>(DIETS),
  mealType: new Set<string>(MEAL_TYPES),
  intolerances: new Set<string>(INTOLERANCES),
  mainIngredients: new Set<string>(MAIN_INGREDIENTS),
};

function canon(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-");
}

export function isKnownDiet(s: string): boolean {
  return KNOWN.diet.has(canon(s));
}
export function isKnownMealType(s: string): boolean {
  return KNOWN.mealType.has(canon(s));
}
export function isKnownMainIngredient(s: string): boolean {
  return KNOWN.mainIngredients.has(canon(s));
}

/**
 * Normalize an arbitrary free-text label into a known canonical term within a
 * vocabulary, or undefined if it isn't recognized. Adapters use this to map
 * vendor categories/tags onto our vocabulary.
 */
export function toCanonical(
  vocab: "diet" | "mealType" | "intolerances" | "mainIngredients",
  raw: string,
): string | undefined {
  const c = canon(raw);
  return KNOWN[vocab].has(c) ? c : undefined;
}
