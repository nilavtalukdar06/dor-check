import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { mapQuerySchema } from "@/lib/map";
import { getMapSignals } from "@/server/map";
import { consumeRateLimit } from "@/server/rate-limit";

/** GET /api/map?bbox=w,s,e,n&layers=reports,properties,tariffs&state=AS|ML&days=30&q=text */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to use the map." }, { status: 401 });
  if (!(await consumeRateLimit(`map:${userId}`, 120, 60))) {
    return NextResponse.json({ error: "Too many map requests. Wait a moment." }, { status: 429 });
  }

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = mapQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid map query.", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const result = await getMapSignals(parsed.data);
  return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=20" } });
}
