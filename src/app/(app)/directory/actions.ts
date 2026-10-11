"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { reindexDirectory } from "@/server/directory-sync";
import { consumeRateLimit } from "@/server/rate-limit";
import {
  createProperty,
  requestListing,
  type ListingRequestResult,
  deleteProperty,
  setPropertyVerified,
  updateProperty,
  type PropertyInput,
} from "@/server/directory";
import { requireRole } from "@/server/roles";
import { getCurrentUser } from "@/server/users";

export type ActionResult<T = { id: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Every directory action starts here: a real role check, then the actor's user id. */
async function moderator() {
  await requireRole("MODERATOR");
  const user = await getCurrentUser();
  if (!user) throw new Error("No user");
  return user.id;
}

function changed(actorId: string) {
  revalidatePath("/directory");
  revalidatePath("/moderation");
  revalidatePath("/map");
  return reindexDirectory(actorId);
}

function fail(err: unknown): ActionResult<never> {
  if (err instanceof ZodError) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: err.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  console.error("Directory action failed", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createPropertyAction(input: PropertyInput): Promise<ActionResult> {
  try {
    const actorId = await moderator();
    const property = await createProperty(actorId, input);
    await changed(actorId);
    return { ok: true, id: property.id };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePropertyAction(id: string, input: PropertyInput): Promise<ActionResult> {
  try {
    const actorId = await moderator();
    await updateProperty(actorId, id, input);
    await changed(actorId);
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function verifyPropertyAction(id: string, verified: boolean): Promise<ActionResult> {
  try {
    const actorId = await moderator();
    await setPropertyVerified(actorId, id, verified);
    await changed(actorId);
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePropertyAction(id: string): Promise<ActionResult> {
  try {
    const actorId = await moderator();
    await deleteProperty(actorId, id);
    await changed(actorId);
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

/** Any signed-in person asks for a business to be listed. It waits for a moderator. */
export async function requestListingAction(input: PropertyInput & { documentEvidenceId?: string }): Promise<ListingRequestResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!(await consumeRateLimit(`listing-form:${user.id}`, 20, 3600))) return { ok: false, error: "Too many attempts. Try again later." };
  try {
    const r = await requestListing(user.id, input);
    if (r.ok) revalidatePath("/moderation");
    return r;
  } catch (err) {
    console.error("listing request failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
