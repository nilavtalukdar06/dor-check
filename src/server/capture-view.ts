import "server-only";

import prisma from "@/lib/prisma";
import { hostOf } from "@/lib/research-policy";
import { keyFromRef, signedUrl, storageConfigured } from "@/server/storage";

export type CaptureRunView = {
  id: string;
  host: string;
  url: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  error: string | null;
  events: { type: string; message: string; at: number }[];
  /** The listing screenshot once the run has produced one. */
  screenshot: { evidenceId: string; link: string | null; width: number | null; height: number | null; capturedAt: string } | null;
  evidenceCount: number;
};

/** One capture run and what it has produced so far, only for its owner. */
export async function getCaptureRun(userId: string, investigationId: string): Promise<CaptureRunView | null> {
  const inv = await prisma.investigation.findFirst({
    where: { id: investigationId, userId, runCapture: true },
    include: {
      evidence: { where: { deletedAt: null }, orderBy: { capturedAt: "asc" } },
      workflowRuns: { orderBy: { createdAt: "desc" }, take: 1, include: { events: { orderBy: { id: "asc" } } } },
    },
  });
  if (!inv) return null;

  const shot = inv.evidence.find((e) => e.kind === "SCREENSHOT");
  let link: string | null = null;
  if (shot && storageConfigured()) {
    const key = keyFromRef(shot.storageUrl);
    link = key ? await signedUrl(key, 3600).catch(() => null) : null;
  }

  return {
    id: inv.id,
    host: hostOf(inv.input),
    url: inv.input,
    status: inv.status === "COMPLETED" ? "COMPLETED" : inv.status === "FAILED" || inv.status === "CANCELLED" ? "FAILED" : "RUNNING",
    error: inv.error,
    events: (inv.workflowRuns[0]?.events ?? []).map((e) => ({ type: e.type, message: e.message ?? e.type, at: e.createdAt.getTime() })),
    screenshot: shot ? { evidenceId: shot.id, link, width: shot.width, height: shot.height, capturedAt: shot.capturedAt.toISOString() } : null,
    evidenceCount: inv.evidence.length,
  };
}
