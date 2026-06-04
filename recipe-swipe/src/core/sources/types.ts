/**
 * The RecipeSource adapter contract — the seam that makes the whole product
 * source-agnostic. Every current API (Spoonacular, Edamam, TheMealDB) and the
 * future Option C publisher bridge implements this. Nothing else in the system
 * talks to a vendor directly. See docs/02-data-sources.md.
 */

import type { CachingPolicy, Recipe } from "../model.ts";
import type { RecipeQuery } from "../vocab.ts";

/** Opaque per-source raw payload. Only the owning adapter understands it. */
export type RawResult = unknown;

export interface SourceCapabilities {
  filters: {
    diet?: boolean;
    mealType?: boolean;
    cuisine?: boolean;
    intolerances?: boolean;
    meatType?: boolean;
    query?: boolean;
  };
  hasImages: boolean;
  hasRatings: boolean;
  hasReviewsText: boolean; // usually false / license-restricted
  hasNutrition: boolean;
  cachingAllowed: CachingPolicy; // from the license — see docs/05
  attributionRequired: boolean;
}

export interface SourceHealth {
  ok: boolean;
  remainingQuota?: number;
  note?: string;
}

export interface RecipeSource {
  /** Stable id, e.g. "themealdb", "spoonacular". */
  readonly id: string;
  /** Human label for attribution / UI. */
  readonly name: string;
  readonly capabilities: SourceCapabilities;

  /** Search/browse a deck of recipes for the given query. */
  search(query: RecipeQuery): Promise<RawResult[]>;

  /** Fetch full detail for one recipe. */
  getById(sourceRecipeId: string): Promise<RawResult | null>;

  /**
   * Normalize this source's raw payload into the canonical Recipe.
   * MUST be pure (no network/DOM) so it can be unit-tested with fixtures.
   */
  normalize(raw: RawResult): Recipe;

  /** Optional: report quota/health for budget-aware routing. */
  health?(): Promise<SourceHealth>;
}

/**
 * Minimal fetch surface adapters depend on. Injected so adapters stay testable
 * (pass a fake) and don't hard-bind to the global — mirrors the repo's
 * "inject now/rand" convention for determinism.
 */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
