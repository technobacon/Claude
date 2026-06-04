/**
 * Pure aggregation logic — merge results from many sources, de-duplicate the
 * same dish arriving from different sources, drop already-swiped recipes, and
 * order the deck. No network, no DOM, no clock except an injected `rand` so the
 * shuffle is testable. See docs/01-architecture.md. This is the heart of the
 * product's logic and is where test coverage should concentrate.
 */

import type { Recipe } from "./model.ts";
import type { RecipeQuery } from "./vocab.ts";

export type Rand = () => number;

/** Normalized fingerprint to detect the same recipe across sources. */
export function fingerprint(r: Recipe): string {
  const title = r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const topIngredients = r.ingredients
    .map((i) => (i.name ?? i.raw).toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean)
    .sort()
    .slice(0, 5)
    .join(",");
  let domain = "";
  try {
    domain = new URL(r.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    domain = "";
  }
  return `${title}|${topIngredients}|${domain}`;
}

/** Richer record wins when collapsing duplicates. */
function richness(r: Recipe): number {
  let score = 0;
  if (r.image?.url) score += 3;
  score += Math.min(r.ingredients.length, 12);
  if (r.rating) score += 2;
  if (r.instructionsSummary) score += 1;
  if (r.nutrition) score += 1;
  return score;
}

/** Collapse duplicates by fingerprint, keeping the richest record. */
export function dedupe(recipes: Recipe[]): Recipe[] {
  const best = new Map<string, Recipe>();
  for (const r of recipes) {
    const key = fingerprint(r);
    const existing = best.get(key);
    if (!existing || richness(r) > richness(existing)) best.set(key, r);
  }
  return [...best.values()];
}

/** Drop recipes the user has already swiped (by canonical id). */
export function excludeSwiped(
  recipes: Recipe[],
  swipedIds: ReadonlySet<string>,
): Recipe[] {
  return recipes.filter((r) => !swipedIds.has(r.id));
}

/**
 * Does a recipe satisfy the requested filters? Used to post-filter results from
 * sources that can't filter natively (graceful degradation), so the deck is
 * uniform regardless of source capabilities.
 */
export function matchesQuery(r: Recipe, q: RecipeQuery): boolean {
  const has = (have: string[], want?: string[]) =>
    !want || want.length === 0 || want.some((w) => have.includes(w));
  if (!has(r.tags.diet, q.diet)) return false;
  if (!has(r.tags.mealType, q.mealType)) return false;
  if (!has(r.tags.cuisine, q.cuisine)) return false;
  if (!has(r.tags.mainIngredients, q.includeIngredients)) return false;
  if (q.excludeIngredients?.length) {
    const names = new Set(r.ingredients.map((i) => (i.name ?? "").toLowerCase()));
    if (q.excludeIngredients.some((x) => names.has(x.toLowerCase()))) return false;
  }
  return true;
}

/** Deterministic Fisher–Yates shuffle using injected rand. */
export function shuffle<T>(items: T[], rand: Rand): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface BuildDeckOptions {
  query: RecipeQuery;
  swipedIds: ReadonlySet<string>;
  rand?: Rand;
  /** Post-filter against the query (for non-native source filtering). */
  postFilter?: boolean;
}

/**
 * Assemble the final deck: dedupe → exclude swiped → (optional) post-filter →
 * rank (v1: light shuffle for variety) → trim to limit.
 */
export function buildDeck(
  recipes: Recipe[],
  { query, swipedIds, rand = Math.random, postFilter = true }: BuildDeckOptions,
): Recipe[] {
  let deck = dedupe(recipes);
  deck = excludeSwiped(deck, swipedIds);
  if (postFilter) deck = deck.filter((r) => matchesQuery(r, query));
  deck = shuffle(deck, rand);
  return deck.slice(0, query.limit);
}
