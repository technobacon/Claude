/**
 * Process-wide singleton wiring. Decides which sources are enabled (TheMealDB is
 * always on — free, no key). Spoonacular/Edamam adapters slot in here once their
 * adapters + API keys exist (Phase 1 continuation); the rest of the app is
 * unchanged because they share the RecipeSource contract.
 */

import { createSpoonacularSource } from "../core/sources/spoonacular.ts";
import { createTheMealDbSource } from "../core/sources/themealdb.ts";
import type { RecipeSource } from "../core/sources/types.ts";
import { RecipeService } from "./service.ts";
import { MemoryStore } from "./store.ts";

function buildSources(): RecipeSource[] {
  // Spoonacular (richer: cook time, diets, allergens) when a key is configured;
  // the key stays server-side. TheMealDB is the always-on free fallback.
  const sources: RecipeSource[] = [];
  if (process.env.SPOONACULAR_API_KEY) {
    sources.push(createSpoonacularSource(process.env.SPOONACULAR_API_KEY));
  }
  sources.push(createTheMealDbSource());
  // if (process.env.EDAMAM_APP_ID && process.env.EDAMAM_APP_KEY)
  //   sources.push(createEdamamSource(process.env.EDAMAM_APP_ID, process.env.EDAMAM_APP_KEY));
  return sources;
}

// Reuse across hot-reloads / route invocations in dev.
const globalForService = globalThis as unknown as {
  __forkfulService?: RecipeService;
};

export const recipeService: RecipeService =
  globalForService.__forkfulService ??
  (globalForService.__forkfulService = new RecipeService(
    buildSources(),
    new MemoryStore(),
  ));
