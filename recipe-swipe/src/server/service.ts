/**
 * RecipeService — orchestrates the feed: ask the registry across all sources,
 * cache results, build the deck (dedupe / exclude-swiped / filter / rank), and
 * handle swipes + the saved list. This is the layer the API routes call; it has
 * no knowledge of HTTP or any specific vendor.
 */

import { buildDeck, type Rand } from "../core/aggregator.ts";
import type { Recipe, SwipeDirection } from "../core/model.ts";
import { SourceRegistry } from "../core/sources/registry.ts";
import type { RecipeSource } from "../core/sources/types.ts";
import type { RecipeQuery } from "../core/vocab.ts";
import { MemoryStore } from "./store.ts";

export class RecipeService {
  #registry: SourceRegistry;
  #store: MemoryStore;
  #rand: Rand;

  constructor(
    sources: RecipeSource[],
    store: MemoryStore = new MemoryStore(),
    rand: Rand = Math.random,
  ) {
    this.#registry = new SourceRegistry(sources);
    this.#store = store;
    this.#rand = rand;
  }

  get sourceNames(): string[] {
    return this.#registry.sources.map((s) => s.name);
  }

  /** Build a deck for the user, excluding what they've already swiped. */
  async getFeed(userId: string, query: RecipeQuery): Promise<Recipe[]> {
    const found = await this.#registry.search(query);
    this.#store.cacheRecipes(found);
    return buildDeck(found, {
      query,
      swipedIds: this.#store.swipedIds(userId),
      rand: this.#rand,
    });
  }

  recordSwipe(
    userId: string,
    recipeId: string,
    direction: SwipeDirection,
  ): void {
    this.#store.recordSwipe(userId, recipeId, direction);
  }

  getList(userId: string): Recipe[] {
    return this.#store.savedRecipes(userId);
  }

  removeFromList(userId: string, recipeId: string): void {
    this.#store.removeSaved(userId, recipeId);
  }
}
