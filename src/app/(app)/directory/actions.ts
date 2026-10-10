"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  createProperty,
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
    revalidatePath("/directory");
    return { ok: true, id: property.id };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePropertyAction(id: string, input: PropertyInput): Promise<ActionResult> {
  try {
    const actorId = await moderator();
    await updateProperty(actorId, id, input);
    revalidatePath("/directory");
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function verifyPropertyAction(id: string, verified: boolean): Promise<ActionResult> {
  try {
    const actorId = await moderator();
    await setPropertyVerified(actorId, id, verified);
    revalidatePath("/directory");
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePropertyAction(id: string): Promise<ActionResult> {
  try {
    const actorId = await moderator();
    await deleteProperty(actorId, id);
    revalidatePath("/directory");
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}
