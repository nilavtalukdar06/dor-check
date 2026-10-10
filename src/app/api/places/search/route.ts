import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { searchMapbox, searchSeeded } from "@/server/geocoding";
import { consumeRateLimit } from "@/server/rate-limit";

/** Suggestions for the place boxes: curated places first, then Mapbox. */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (!(await consumeRateLimit(`places:${userId}`, 120, 60))) {
    return NextResponse.json({ error: "Too many searches. Wait a moment." }, { status: 429 });
  }

  const [seeded, mapbox] = await Promise.all([searchSeeded(q, 4), searchMapbox(q, 5)]);
  const names = new Set(seeded.map((s) => s.name.toLowerCase()));
  const results = [...seeded, ...mapbox.filter((m) => !names.has(m.name.toLowerCase()))].slice(0, 8);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "private, max-age=60" } });
}
