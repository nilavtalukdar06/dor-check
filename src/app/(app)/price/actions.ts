"use server";

import { inngest } from "@/inngest/client";
import { priceCheckRequested } from "@/inngest/events";
import { priceCheckSchema, type PriceCheckInput } from "@/lib/price-schema";
import prisma from "@/lib/prisma";
import { failRun, createPriceRun } from "@/server/price-pipeline";
import { getCurrentUser, getPersonalWorkspace } from "@/server/users";

export type CompareResult =
  | { ok: true; id: string; status: "running" }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Start a price check. The work runs as a durable Inngest workflow; this returns as soon as
 * the check exists, and the page follows its progress live.
 */
export async function comparePriceAction(input: PriceCheckInput): Promise<CompareResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in to compare prices." };

  const parsed = priceCheckSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  let id: string;
  try {
    const workspace = await getPersonalWorkspace(user.id);
    id = await createPriceRun(user.id, workspace.id, parsed.data);
  } catch (err) {
    console.error("Price check could not be created", err);
    return { ok: false, error: "We could not start that comparison. Please try again." };
  }

  try {
    // The event id makes a double submit start only one workflow.
    await inngest.send(priceCheckRequested.create({ investigationId: id, userId: user.id }, { id: `price-check-${id}` }));
  } catch (err) {
    console.error("Could not reach the workflow service", err);
    await failRun(id, "The background worker could not be reached").catch(() => undefined);
    await prisma.workflowRun.updateMany({ where: { investigationId: id }, data: { status: "FAILED" } }).catch(() => undefined);
    return { ok: false, error: "The background worker is not reachable right now. Please try again in a moment." };
  }
  return { ok: true, id, status: "running" };
}
