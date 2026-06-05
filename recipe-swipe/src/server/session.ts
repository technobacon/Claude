/**
 * Lightweight anonymous session + query parsing for the API routes. Anonymous
 * cookie now (low-friction swiping, SomeYum-style); real auth lands in Phase 3.
 */

import { cookies } from "next/headers";
import type { RecipeQuery } from "../core/vocab.ts";

const COOKIE = "forkful_uid";

/** Read the anon user id from the cookie, creating one on first visit. */
export async function getOrCreateUserId(): Promise<string> {
  const store = await cookies();
  let id = store.get(COOKIE)?.value;
  if (!id) {
    id = crypto.randomUUID();
    store.set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return id;
}

function csv(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const parts = v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

export function parseQuery(params: URLSearchParams): RecipeQuery {
  const limit = Math.min(Math.max(Number(params.get("limit")) || 15, 1), 30);
  const maxTime = Number(params.get("maxTime"));
  return {
    text: params.get("text")?.trim() || undefined,
    diet: csv(params.get("diet")),
    mealType: csv(params.get("mealType")),
    cuisine: csv(params.get("cuisine")),
    intolerances: csv(params.get("intolerances")),
    includeIngredients: csv(params.get("include")),
    excludeIngredients: csv(params.get("exclude")),
    maxReadyMinutes: maxTime > 0 ? maxTime : undefined,
    difficulty: csv(params.get("difficulty")),
    limit,
  };
}
