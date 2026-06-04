import { NextResponse } from "next/server";
import { recipeService } from "@/server/instance.ts";
import { getOrCreateUserId } from "@/server/session.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getOrCreateUserId();
  return NextResponse.json({ saved: recipeService.getList(userId) });
}

export async function DELETE(request: Request) {
  const userId = await getOrCreateUserId();
  const recipeId = new URL(request.url).searchParams.get("recipeId");
  if (!recipeId) {
    return NextResponse.json({ error: "missing recipeId" }, { status: 400 });
  }
  recipeService.removeFromList(userId, recipeId);
  return NextResponse.json({ ok: true });
}
