import { NextResponse } from "next/server";
import { recipeService } from "@/server/instance.ts";
import { getOrCreateUserId, parseQuery } from "@/server/session.ts";

// Always hit live sources; the service caches normalized results internally.
export const dynamic = "force-dynamic";

// Permissive CORS so a client served elsewhere (e.g. the standalone via a CDN)
// can call this deployed backend. No secrets are exposed — only recipe data.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const userId = await getOrCreateUserId();
  const query = parseQuery(new URL(request.url).searchParams);
  const deck = await recipeService.getFeed(userId, query);
  return NextResponse.json(
    { deck, source: recipeService.primarySource, sources: recipeService.sourceNames },
    { headers: CORS },
  );
}
