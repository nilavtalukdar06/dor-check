import "server-only";

import { median, successRate } from "@/lib/moderation";
import prisma from "@/lib/prisma";

export type WorkflowKpis = { runsToday: number; successRate: number | null; medianMs: number | null; retries: number };
export type WorkflowRow = { id: string; runCode: string; type: string; subject: string; status: string; stepsDone: number; stepsTotal: number; attempt: number; maxAttempts: number; durationMs: number | null; createdAt: Date; error: string | null; href: string | null };
export type StreamEvent = { id: number; type: string; message: string | null; at: Date; runCode: string };

const dayStart = () => {
  // Midnight in India, where the people using this are.
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000);
};

/** Numbers for the top of the screen, from our own tables (no dependency on Inngest's API). */
export async function getWorkflowKpis(): Promise<WorkflowKpis> {
  const since = dayStart();
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [runsToday, completed, failed, durations, retries] = await Promise.all([
    prisma.workflowRun.count({ where: { createdAt: { gte: since } } }),
    prisma.workflowRun.count({ where: { createdAt: { gte: weekAgo }, status: "COMPLETED" } }),
    prisma.workflowRun.count({ where: { createdAt: { gte: weekAgo }, status: "FAILED" } }),
    prisma.workflowRun.findMany({ where: { createdAt: { gte: weekAgo }, status: "COMPLETED", OR: [{ durationMs: { not: null } }, { startedAt: { not: null }, finishedAt: { not: null } }] }, select: { durationMs: true, startedAt: true, finishedAt: true }, take: 1000 }),
    prisma.runStep.count({ where: { run: { createdAt: { gte: since } }, attempt: { gt: 1 } } }),
  ]);
  const ms = durations.map((d) => d.durationMs ?? (d.startedAt && d.finishedAt ? d.finishedAt.getTime() - d.startedAt.getTime() : NaN));
  return { runsToday, successRate: successRate(completed, failed), medianMs: median(ms), retries };
}

/** Recent runs, newest first. */
export async function listRuns(filter: { status?: string; type?: string } = {}, take = 40): Promise<WorkflowRow[]> {
  const rows = await prisma.workflowRun.findMany({
    where: { ...(filter.status ? { status: filter.status as never } : {}), ...(filter.type ? { type: filter.type } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, runCode: true, type: true, subject: true, status: true, stepsDone: true, stepsTotal: true, attempt: true, maxAttempts: true, durationMs: true, startedAt: true, finishedAt: true, createdAt: true, error: true, investigationId: true, investigation: { select: { kind: true } }, reportId: true, report: { select: { reference: true } } },
  });
  return rows.map((r) => ({
    id: r.id, runCode: r.runCode, type: r.type, subject: r.subject, status: r.status, stepsDone: r.stepsDone, stepsTotal: r.stepsTotal, attempt: r.attempt, maxAttempts: r.maxAttempts, createdAt: r.createdAt, error: r.error,
    durationMs: r.durationMs ?? (r.startedAt && r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : r.startedAt && (r.status === "RUNNING" || r.status === "RETRYING") ? Date.now() - r.startedAt.getTime() : null),
    href: r.report ? `/reports/${r.report.reference}` : null,
  }));
}

/** The latest events across runs (or for one run). */
export async function listEvents(runId?: string, take = 20): Promise<StreamEvent[]> {
  const rows = await prisma.runEvent.findMany({ where: runId ? { runId } : {}, orderBy: { id: "desc" }, take, select: { id: true, type: true, message: true, createdAt: true, run: { select: { runCode: true } } } });
  return rows.map((e) => ({ id: e.id, type: e.type, message: e.message, at: e.createdAt, runCode: e.run.runCode }));
}
