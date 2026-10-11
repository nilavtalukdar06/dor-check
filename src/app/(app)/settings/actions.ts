"use server";

import { revalidatePath } from "next/cache";
import type { PreferencePatch } from "@/lib/settings";
import { markAllRead, markRead, saveDisplayName, savePreferences, type SaveResult } from "@/server/settings";
import { getCurrentUser } from "@/server/users";

/** Save one or more preferences for the signed-in person. */
export async function savePreferencesAction(patch: PreferencePatch): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const r = await savePreferences(user.id, patch);
  if (r.ok) revalidatePath("/settings");
  return r;
}

export async function saveDisplayNameAction(name: string): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const r = await saveDisplayName(user.id, name);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (user) await markRead(user.id, id);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await markAllRead(user.id);
}
