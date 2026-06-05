import { NextResponse } from "next/server";
import { recipeService } from "@/server/instance.ts";

// Tells a client which backend/source is live so it can render the right
// filter set without shipping any API key.
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function GET() {
  const source = recipeService.primarySource;
  return NextResponse.json(
    { ok: true, source: source.id, sourceName: source.name },
    { headers: CORS },
  );
}
