import { NextResponse } from "next/server";
import { formatStamp, slug } from "@/lib/evidence";
import prisma from "@/lib/prisma";
import { consumeRateLimit } from "@/server/rate-limit";
import { keyFromRef, signedUrl, storageConfigured } from "@/server/storage";
import { getCurrentUser } from "@/server/users";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/webm": "webm", "application/json": "json" };

/**
 * GET /api/evidence/[id]/file: sends the owner to a short-lived signed link. `?download=1`
 * makes the browser save the file instead of showing it.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!storageConfigured()) return NextResponse.json({ error: "File storage is not set up yet." }, { status: 503 });
  if (!(await consumeRateLimit(`evidence-file:${user.id}`, 120, 60))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const { id } = await ctx.params;
  const item = await prisma.evidence.findFirst({
    where: { id, ownerId: user.id, deletedAt: null },
    select: { title: true, storageUrl: true, mimeType: true, capturedAt: true },
  });
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";

  const key = keyFromRef(item.storageUrl);
  if (!key) return NextResponse.json({ error: "No file stored for this item." }, { status: 404 });

  const ext = EXT[item.mimeType] ?? "bin";
  const name = `${slug(item.title)}-${formatStamp(item.capturedAt).replace(/[ :]/g, "-")}.${ext}`;
  const url = await signedUrl(key, 120, download ? name : undefined);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
