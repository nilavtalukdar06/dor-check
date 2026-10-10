"use server";

import { getClientSubscriptionToken } from "inngest/react";
import { investigationRunChannel } from "@/inngest/channels";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/server/users";

/**
 * A short-lived token that lets the browser watch one investigation. Channels are addressable by
 * id, so the caller must own the investigation before a token is minted.
 */
export async function fetchInvestigationRunToken(investigationId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first");
  const owned = await prisma.investigation.findFirst({ where: { id: investigationId, userId: user.id }, select: { id: true } });
  if (!owned) throw new Error("Not found");
  return getClientSubscriptionToken(inngest, { channel: investigationRunChannel(investigationId), topics: ["update", "finished"] });
}
