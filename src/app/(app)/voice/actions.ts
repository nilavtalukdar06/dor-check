"use server";

import { getCurrentUser } from "@/server/users";
import { deleteVoiceJob } from "@/server/voice";

/** Remove one clip from history (and its audio, unless another clip shares it). */
export async function deleteVoiceJobAction(id: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  return { ok: await deleteVoiceJob(user.id, id) };
}
