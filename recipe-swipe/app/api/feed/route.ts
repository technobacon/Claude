import { NextResponse } from "next/server";
import { recipeService } from "@/server/instance.ts";
import { getOrCreateUserId, parseQuery } from "@/server/session.ts";

// Always hit live sources; the service caches normalized results internally.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getOrCreateUserId();
  const query = parseQuery(new URL(request.url).searchParams);
  const deck = await recipeService.getFeed(userId, query);
  return NextResponse.json({ deck, sources: recipeService.sourceNames });
}
