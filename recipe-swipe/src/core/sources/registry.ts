/**
 * Source registry — holds the set of enabled RecipeSources and fans a query out
 * across them, normalizing every result into canonical Recipes. One source
 * failing or being over quota degrades variety but never breaks the feed.
 */

import { validateRecipe, type Recipe } from "../model.ts";
import type { RecipeQuery } from "../vocab.ts";
import type { RecipeSource } from "./types.ts";

export class SourceRegistry {
  #sources: RecipeSource[];

  constructor(sources: RecipeSource[]) {
    this.#sources = sources;
  }

  get sources(): readonly RecipeSource[] {
    return this.#sources;
  }

  /** Query every source in parallel; merge normalized, valid recipes. */
  async search(query: RecipeQuery): Promise<Recipe[]> {
    const perSource = await Promise.all(
      this.#sources.map((s) => this.#searchOne(s, query)),
    );
    return perSource.flat();
  }

  async #searchOne(source: RecipeSource, query: RecipeQuery): Promise<Recipe[]> {
    try {
      const raw = await source.search(query);
      const recipes: Recipe[] = [];
      for (const r of raw) {
        try {
          const recipe = source.normalize(r);
          if (validateRecipe(recipe).length === 0) recipes.push(recipe);
        } catch {
          // Skip a single malformed record without failing the whole source.
        }
      }
      return recipes;
    } catch {
      // A source outage/quota error degrades variety, not the feed.
      return [];
    }
  }
}
