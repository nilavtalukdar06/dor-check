import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLiveView } from "@/server/live-view";
import { consumeRateLimit } from "@/server/rate-limit";
import { getCurrentUser } from "@/server/users";

/** GET /api/investigations/[id]/live: a fresh live-view URL while the browser is running. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await consumeRateLimit(`live-view:${user.id}`, 60, 60))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await ctx.params;
  const view = await getLiveView(id, user.id);
  if (!view) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
