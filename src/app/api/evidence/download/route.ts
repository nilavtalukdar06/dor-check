import { zipSync } from "fflate";
import { NextResponse } from "next/server";
import { evidenceParamsSchema, formatStamp, slug } from "@/lib/evidence";
import prisma from "@/lib/prisma";
import { vaultWhere } from "@/server/evidence";
import { consumeRateLimit } from "@/server/rate-limit";
import { getObjectBytes, keyFromRef, storageConfigured } from "@/server/storage";
import { getCurrentUser } from "@/server/users";

const MAX_ITEMS = 50;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/webm": "webm", "application/json": "json" };

/** GET /api/evidence/download?type=&q=: a zip of the caller's items that match the filters, with a manifest. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!storageConfigured()) return NextResponse.json({ error: "File storage is not set up yet." }, { status: 503 });
  if (!(await consumeRateLimit(`evidence-zip:${user.id}`, 6, 3600))) return NextResponse.json({ error: "Too many downloads this hour. Try again later." }, { status: 429 });

  const params = evidenceParamsSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await prisma.evidence.findMany({
    where: vaultWhere(user.id, { type: params.type, q: params.q }),
    orderBy: { capturedAt: "desc" },
    take: MAX_ITEMS,
  });
  if (rows.length === 0) return NextResponse.json({ error: "Nothing to download." }, { status: 404 });

  const files: Record<string, Uint8Array> = {};
  const manifest: Record<string, unknown>[] = [];
  let total = 0;
  for (const e of rows) {
    const key = keyFromRef(e.storageUrl);
    if (!key) continue;
    let bytes: Uint8Array;
    try {
      bytes = await getObjectBytes(key);
    } catch {
      continue; // a missing file should not spoil the rest of the archive
    }
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) break;
    const name = `${slug(e.title)}-${formatStamp(e.capturedAt).replace(/[ :]/g, "-")}-${e.id.slice(-4)}.${EXT[e.mimeType] ?? "bin"}`;
    files[name] = bytes;
    manifest.push({ file: name, title: e.title, kind: e.kind, subject: e.subject, url: e.url, capturedAt: e.capturedAt.toISOString(), capturedBy: e.capturedBy, sha256: e.sha256 });
  }
  if (manifest.length === 0) return NextResponse.json({ error: "The files could not be read." }, { status: 502 });
  files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  // Screenshots are already compressed; zip them without spending CPU on deflate.
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([n, b]) => [n, [b, { level: 0 }] as [Uint8Array, { level: 0 }]])));
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="evidence-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
