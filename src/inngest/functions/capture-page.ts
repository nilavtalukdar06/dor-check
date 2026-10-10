import { inngest } from "../client";
import { captureRequested } from "../events";
import prisma from "@/lib/prisma";
import { capturePage, type CaptureResult } from "@/server/capture";

/**
 * Durable page capture. A failed capture is a recorded result, not a failed run: the caller
 * carries on with lower confidence. Only unexpected errors (database down) are retried.
 */
export const captureOnePage = inngest.createFunction(
  {
    id: "capture-page",
    triggers: [captureRequested],
    retries: 2,
    concurrency: [{ key: "event.data.investigationId", limit: 1 }],
    timeouts: { finish: "4m" },
    onFailure: async ({ event }) => {
      const id = (event.data.event.data as { investigationId?: string }).investigationId;
      if (!id) return;
      await prisma.investigation.update({ where: { id }, data: { status: "FAILED", error: "The capture could not finish" } }).catch(() => undefined);
      await prisma.workflowRun.updateMany({ where: { investigationId: id, status: "RUNNING" }, data: { status: "FAILED", finishedAt: new Date() } });
    },
  },
  async ({ event, step }) => {
    const { investigationId } = event.data;

    const target = await step.run("load", async () => {
      const inv = await prisma.investigation.findUniqueOrThrow({
        where: { id: investigationId },
        include: { workflowRuns: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      const run = inv.workflowRuns[0];
      await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: new Date() } });
      return { url: inv.input, userId: inv.userId, workspaceId: inv.workspaceId, subject: inv.title, runId: run.id };
    });

    // The browser session id is written as soon as the session exists, so the live view can attach.
    const result: CaptureResult = await step.run("capture-page", () =>
      capturePage(target.url, {
        userId: target.userId,
        workspaceId: target.workspaceId,
        investigationId,
        subject: target.subject,
        onSession: async (sessionId) => {
          await prisma.workflowRun.update({ where: { id: target.runId }, data: { browserSessionId: sessionId } });
        },
        emit: async (type, message) => {
          await prisma.runEvent.create({ data: { runId: target.runId, type, message } });
        },
      }),
    );

    await step.run("finish", async () => {
      const ok = result.ok;
      await prisma.runEvent.create({
        data: {
          runId: target.runId,
          type: ok ? "capture_completed" : "capture_failed",
          message: ok ? `Captured ${result.evidence.length} evidence item${result.evidence.length === 1 ? "" : "s"}` : result.message,
        },
      });
      await prisma.workflowRun.update({
        where: { id: target.runId },
        data: { status: ok ? "COMPLETED" : "FAILED", finishedAt: new Date(), error: ok ? null : result.message },
      });
      await prisma.investigation.update({
        where: { id: investigationId },
        data: { status: ok ? "COMPLETED" : "FAILED", completedAt: new Date(), error: ok ? null : result.message },
      });
    });
    return { ok: result.ok };
  },
);
