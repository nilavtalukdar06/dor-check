"use server";

import { setSharing } from "@/server/investigation";
import { getCurrentUser } from "@/server/users";

/** Owner only: turn the public link on or off. Returns the token to build the link from. */
export async function setSharingAction(id: string, enabled: boolean): Promise<{ ok: true; token: string | null } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  return setSharing(user.id, id, enabled);
}
