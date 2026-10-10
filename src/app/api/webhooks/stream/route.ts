import prisma from "@/lib/prisma";
import { mirrorStreamMessage } from "@/server/comments";
import { streamConfigured, streamServer } from "@/server/stream";

/**
 * Stream webhook. The signature is an HMAC over the exact bytes received, so the body is read
 * raw and verified before anything is parsed. Handles message.new (mirror into the database)
 * and message.flagged (a flag made in Stream's own dashboard).
 */
export async function POST(request: Request) {
  if (!streamConfigured()) return new Response("Not configured", { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("x-signature") ?? "";
  if (!signature || !streamServer().verifyWebhook(raw, signature)) return new Response("Bad signature", { status: 401 });

  let event: { type: string; channel_id?: string; channel_type?: string; message?: { id: string; text?: string; user?: { id: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad body", { status: 400 });
  }

  if (event.type === "message.flagged" && event.message?.id) {
    await prisma.comment.updateMany({ where: { streamMessageId: event.message.id, status: "VISIBLE" }, data: { status: "FLAGGED", flaggedReason: "Flagged in Stream", flaggedAt: new Date() } });
    return Response.json({ ok: true });
  }
  const result = await mirrorStreamMessage(event);
  return Response.json({ ok: true, ...result });
}
