"use server";

import { priceCheckSchema, type PriceCheckInput } from "@/lib/price-schema";
import { createPriceCheck } from "@/server/price-check";
import { getCurrentUser, getPersonalWorkspace } from "@/server/users";

export type CompareResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Compare a quote with the tariff range and save the check. Returns the id to open. */
export async function comparePriceAction(input: PriceCheckInput): Promise<CompareResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in to compare prices." };

  const parsed = priceCheckSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const workspace = await getPersonalWorkspace(user.id);
    const id = await createPriceCheck(user.id, workspace.id, parsed.data);
    return { ok: true, id };
  } catch (err) {
    console.error("Price check failed", err);
    return { ok: false, error: "We could not run that comparison. Please try again." };
  }
}
