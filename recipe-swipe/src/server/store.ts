/**
 * In-memory store for Phase 1. Swappable for Postgres in Phase 3 (the schema in
 * docs/03-data-model.md mirrors these structures). Keeps swipes (so the deck
 * doesn't repeat), the saved list, and a recipe cache (cost control).
 *
 * NOTE: process-memory only — resets on restart. Fine for the MVP/demo.
 */

import type { Recipe, SwipeDirection } from "../core/model.ts";

interface UserState {
  swipes: Map<string, SwipeDirection>; // recipeId -> direction
  saved: string[]; // recipeIds, newest first
}

export class MemoryStore {
  #users = new Map<string, UserState>();
  #recipes = new Map<string, Recipe>(); // recipeId -> normalized recipe (cache)

  #user(userId: string): UserState {
    let u = this.#users.get(userId);
    if (!u) {
      u = { swipes: new Map(), saved: [] };
      this.#users.set(userId, u);
    }
    return u;
  }

  /** Cache normalized recipes (respecting per-recipe caching policy). */
  cacheRecipes(recipes: Recipe[]): void {
    for (const r of recipes) {
      if (r.cachingAllowed === "no") continue;
      this.#recipes.set(r.id, r);
    }
  }

  getRecipe(recipeId: string): Recipe | undefined {
    return this.#recipes.get(recipeId);
  }

  swipedIds(userId: string): Set<string> {
    return new Set(this.#user(userId).swipes.keys());
  }

  recordSwipe(
    userId: string,
    recipeId: string,
    direction: SwipeDirection,
  ): void {
    const u = this.#user(userId);
    u.swipes.set(recipeId, direction);
    if (direction === "right" && !u.saved.includes(recipeId)) {
      u.saved.unshift(recipeId);
    }
  }

  /** Saved (right-swiped) recipes, resolved from cache, newest first. */
  savedRecipes(userId: string): Recipe[] {
    const u = this.#user(userId);
    return u.saved
      .map((id) => this.#recipes.get(id))
      .filter((r): r is Recipe => r !== undefined);
  }

  removeSaved(userId: string, recipeId: string): void {
    const u = this.#user(userId);
    u.saved = u.saved.filter((id) => id !== recipeId);
  }
}
