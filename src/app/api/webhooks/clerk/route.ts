import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import {
  deleteUserByClerkId,
  fromWebhookUser,
  upsertUser,
  type ClerkWebhookUser,
} from "@/server/users";

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("Clerk webhook verification failed", err);
    return new Response("Verification failed", { status: 400 });
  }

  // Svix retries on failure; the delivery id makes handling idempotent.
  const deliveryId = req.headers.get("svix-id") ?? `${evt.type}:${Date.now()}`;
  try {
    await prisma.webhookEvent.create({
      data: { id: deliveryId, source: "clerk", type: evt.type },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const seen = await prisma.webhookEvent.findUnique({
        where: { id: deliveryId },
      });
      if (seen?.processedAt)
        return new Response("Already processed", { status: 200 });
    } else {
      throw err;
    }
  }

  try {
    switch (evt.type) {
      case "user.created":
      case "user.updated":
        await upsertUser(
          fromWebhookUser(evt.data as unknown as ClerkWebhookUser),
        );
        break;
      case "user.deleted":
        if (evt.data.id) await deleteUserByClerkId(evt.data.id);
        break;
      default:
        break;
    }
    await prisma.webhookEvent.update({
      where: { id: deliveryId },
      data: { processedAt: new Date(), error: null },
    });
  } catch (err) {
    console.error("Clerk webhook handler failed", err);
    await prisma.webhookEvent
      .update({
        where: { id: deliveryId },
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      .catch(() => undefined);
    // Non-2xx so Svix retries.
    return new Response("Handler failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
