import { NextResponse } from "next/server";
import { recipeService } from "@/server/instance.ts";
import { getOrCreateUserId } from "@/server/session.ts";

export async function POST(request: Request) {
  const userId = await getOrCreateUserId();
  const body = (await request.json().catch(() => null)) as {
    recipeId?: string;
    direction?: string;
  } | null;

  if (!body?.recipeId || (body.direction !== "right" && body.direction !== "left")) {
    return NextResponse.json(
      { error: "expected { recipeId, direction: 'right' | 'left' }" },
      { status: 400 },
    );
  }

  recipeService.recordSwipe(userId, body.recipeId, body.direction);
  return NextResponse.json({ ok: true });
}
