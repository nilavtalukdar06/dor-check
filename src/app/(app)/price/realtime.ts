"use server";

import { getClientSubscriptionToken } from "inngest/react";
import { inngest } from "@/inngest/client";
import { priceRunChannel } from "@/inngest/channels";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/server/users";

/**
 * A short-lived token that lets the browser watch one price check. Channels are addressable by
 * id, so the caller must own the investigation before a token is minted.
 */
export async function fetchPriceRunToken(investigationId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first");
  const owned = await prisma.investigation.findFirst({
    where: { id: investigationId, userId: user.id, kind: "PRICE" },
    select: { id: true },
  });
  if (!owned) throw new Error("Not found");

  return getClientSubscriptionToken(inngest, {
    channel: priceRunChannel(investigationId),
    topics: ["progress", "finished"],
  });
}
