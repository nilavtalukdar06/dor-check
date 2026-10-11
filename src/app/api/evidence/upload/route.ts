import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/evidence";
import { sniffImage } from "@/lib/image-info";
import prisma from "@/lib/prisma";
import { consumeRateLimit } from "@/server/rate-limit";
import { putObject, storageConfigured } from "@/server/storage";
import { getCurrentUser, getPersonalWorkspace } from "@/server/users";

const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** POST /api/evidence/upload: one image (PNG, JPEG or WebP) or PDF document, up to 8 MB, into the caller's vault. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!storageConfigured()) return json({ error: "File storage is not set up yet." }, 503);
  if (!(await consumeRateLimit(`evidence-upload:${user.id}`, 30, 3600))) return json({ error: "Too many uploads this hour. Try again later." }, 429);

  // Refuse oversized bodies before reading them.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "That file is larger than 8 MB." }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "The upload could not be read." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json({ error: "Choose an image to upload." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "That file is larger than 8 MB." }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  // A PDF is recognised by its first bytes, not its name or declared type.
  const pdf = bytes.length > 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  const info = pdf ? { ext: "pdf", mime: "application/pdf", width: null, height: null } : sniffImage(bytes);
  if (!info) return json({ error: "Only PNG, JPEG or WebP images, or PDF documents, can be uploaded." }, 415);

  const clean = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const title = clean(form.get("title"), 80) || file.name.replace(/\.[^.]+$/, "").slice(0, 80) || (pdf ? "Uploaded document" : "Uploaded image");
  const subject = clean(form.get("subject"), 120) || null;

  const { ref, key } = await putObject(`evidence/${user.id}/uploads/${Date.now()}-${randomUUID().slice(0, 8)}.${info.ext}`, bytes, info.mime);
  const workspace = await getPersonalWorkspace(user.id);
  const row = await prisma.evidence.create({
    data: {
      ownerId: user.id,
      workspaceId: workspace.id,
      kind: pdf ? "DOCUMENT" : "UPLOAD",
      title,
      subject,
      storageKey: key,
      storageUrl: ref,
      mimeType: info.mime,
      sizeBytes: bytes.length,
      width: info.width,
      height: info.height,
      capturedBy: "user",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    select: { id: true },
  });
  return json({ id: row.id }, 201);
}
