"use server";

import { revalidatePath } from "next/cache";
import { archiveThread } from "@/server/assistant";
import { getCaptureRun, type CaptureRunView } from "@/server/capture-view";
import { getInvestigationView } from "@/server/investigation-view";
import { getCurrentUser } from "@/server/users";

/** Remove a conversation from the list (kept in the database, hidden). */
export async function archiveThreadAction(id: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const ok = await archiveThread(user.id, id);
  if (ok) revalidatePath("/assistant", "layout");
  return { ok };
}

export type RunProgress = { status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "DRAFT"; stepsDone: number; totalSteps: number; title: string; latest: string | null };

/** Where a check started from the chat has got to. Only for its owner. */
export async function getRunProgressAction(investigationId: string): Promise<RunProgress | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const v = await getInvestigationView(user.id, investigationId);
  return v ? { status: v.status, stepsDone: v.stepsDone, totalSteps: v.totalSteps, title: v.subject, latest: v.latest } : null;
}

/** A page the assistant opened in the browser: still running, or finished with a screenshot. Only for its owner. */
export async function getBrowseProgressAction(captureId: string): Promise<CaptureRunView | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return getCaptureRun(user.id, captureId);
}
