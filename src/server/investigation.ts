import { Prisma, type RunStatus } from "@/generated/prisma/client";
import type { Identifiers } from "@/lib/identifiers";
import {
  INVESTIGATION_METRIC,
  INVESTIGATION_STEPS,
  investigationTitle,
  maskPhone,
  maskUpi,
  usagePeriodStart,
  type InputType,
  type InvestigationStepKey,
} from "@/lib/investigation";
import prisma from "@/lib/prisma";
import { isSafePublicUrl } from "@/lib/research-policy";
import { investigationRunChannel } from "@/inngest/channels";
import { inngest } from "@/inngest/client";
import { investigationCancelled, investigationRequested } from "@/inngest/events";
import type { AgentInput, AgentResult } from "@/server/agent";
import { saveAgentResult } from "@/server/agent-persist";
import type { AgentOptions } from "@/server/agent-tools";
import { consumeRateLimit } from "@/server/rate-limit";

// An investigation as records: the Investigation, its WorkflowRun, six RunSteps, and a RunEvent
// timeline the live screen reads. The workflow (inngest/functions/run-investigation.ts) drives it.

const MAX_INPUT = 2000;
const INVESTIGATIONS_PER_HOUR = 20;
const runCode = () => `run_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export type StartInput = { inputType: InputType; input: string; sellerStatement?: string | null; options?: Partial<AgentOptions>; districtId?: string | null; serviceType?: "STAY" | "TAXI" | "GUIDE" | "TOUR" | "OTHER" | null };
export type StartResult = { ok: true; id: string } | { ok: false; error: string };

export const DEFAULT_RUN_OPTIONS: AgentOptions = { research: true, capture: true, knowledge: true, price: true };

/** Create the investigation, its run and its six steps, not yet started. */
export async function createInvestigation(userId: string, workspaceId: string, input: StartInput): Promise<string> {
  const options = { ...DEFAULT_RUN_OPTIONS, ...input.options };
  const title = investigationTitle(input.inputType, input.input);
  const startedAt = new Date();
  const inv = await prisma.investigation.create({
    data: {
      workspaceId,
      userId,
      kind: "BOOKING",
      inputType: input.inputType,
      title,
      input: input.input.trim().slice(0, MAX_INPUT),
      sellerStatement: input.sellerStatement?.trim().slice(0, 1500) || null,
      districtId: input.districtId || null,
      serviceType: input.serviceType || null,
      runResearch: options.research,
      runCapture: options.capture,
      runKnowledge: options.knowledge,
      runPrice: options.price,
      status: "QUEUED",
      totalSteps: INVESTIGATION_STEPS.length,
      createdVia: "form",
      workflowRuns: {
        create: {
          runCode: runCode(),
          type: "investigation",
          subject: title,
          status: "QUEUED",
          userId,
          stepsTotal: INVESTIGATION_STEPS.length,
          startedAt,
          steps: { create: INVESTIGATION_STEPS.map(([key, stepTitle], order) => ({ order, key, title: stepTitle })) },
        },
      },
    },
    select: { id: true },
  });
  return inv.id;
}

/** Validate, create and send the event. The workflow takes it from here. */
export async function startInvestigation(user: { id: string }, input: StartInput): Promise<StartResult> {
  const text = input.input.trim();
  if (text.length < 3) return { ok: false, error: "Enter a link, a business name, a message or a phone number or UPI id." };
  if (text.length > MAX_INPUT) return { ok: false, error: "That is too long. Paste the key part (up to 2,000 characters)." };
  if (input.inputType === "LINK") {
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    if (!isSafePublicUrl(url)) return { ok: false, error: "Enter a public http or https address." };
  }
  if (!(await consumeRateLimit(`investigation:${user.id}`, INVESTIGATIONS_PER_HOUR, 3600))) {
    return { ok: false, error: "You have started a lot of checks this hour. Try again later." };
  }

  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: user.id, isPersonal: true }, select: { id: true } });
  const id = await createInvestigation(user.id, workspace.id, input);
  try {
    await inngest.send(investigationRequested.create({ investigationId: id, userId: user.id }, { id: `investigation-${id}` }));
  } catch {
    await failInvestigation(id, "We could not start the check.");
    return { ok: false, error: "We could not start the check right now. Please try again in a moment." };
  }
  return { ok: true, id };
}

/** Stop a running investigation. Only its owner can. */
export async function cancelInvestigation(userId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const inv = await prisma.investigation.findFirst({ where: { id, userId }, select: { id: true, status: true } });
  if (!inv) return { ok: false, error: "Not found." };
  if (inv.status !== "QUEUED" && inv.status !== "RUNNING") return { ok: false, error: "This check has already finished." };
  await prisma.investigation.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } });
  await prisma.workflowRun.updateMany({ where: { investigationId: id, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
  await prisma.runStep.updateMany({ where: { run: { investigationId: id }, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED" } });
  await inngest.send(investigationCancelled.create({ investigationId: id })).catch(() => undefined);
  await announceFinished(id, "CANCELLED");
  return { ok: true };
}

// ───────────────────────── Loading a run for the workflow ─────────────────────────

export type RunRef = {
  investigationId: string;
  runId: string;
  userId: string;
  workspaceId: string;
  title: string;
  input: AgentInput;
  stepIds: Record<InvestigationStepKey, string>;
  startedAt: number;
};

/** Load the run and mark it running. Returns null if there is nothing to do (cancelled, or already done). */
export async function loadRunRef(investigationId: string): Promise<RunRef | null> {
  const inv = await prisma.investigation.findUniqueOrThrow({
    where: { id: investigationId },
    include: { district: { select: { name: true } }, workflowRuns: { orderBy: { createdAt: "desc" }, take: 1, include: { steps: { orderBy: { order: "asc" } } } } },
  });
  if (inv.status === "CANCELLED" || inv.status === "COMPLETED") return null;
  const run = inv.workflowRuns[0];
  // Only QUEUED moves to RUNNING, atomically: a cancel that lands between the read above and this
  // write must win, not be overwritten.
  if (inv.status !== "RUNNING") {
    const moved = await prisma.investigation.updateMany({ where: { id: inv.id, status: { in: ["QUEUED", "DRAFT"] } }, data: { status: "RUNNING", startedAt: inv.startedAt ?? new Date() } });
    if (moved.count === 0) return null;
  }
  await prisma.workflowRun.updateMany({ where: { id: run.id, status: { in: ["QUEUED", "RETRYING"] } }, data: { status: "RUNNING", startedAt: run.startedAt ?? new Date() } });
  return {
    investigationId: inv.id,
    runId: run.id,
    userId: inv.userId,
    workspaceId: inv.workspaceId,
    title: inv.title,
    input: {
      inputType: inv.inputType as InputType,
      input: inv.input,
      sellerStatement: inv.sellerStatement,
      options: { research: inv.runResearch, capture: inv.runCapture, knowledge: inv.runKnowledge, price: inv.runPrice },
      context: { district: inv.district?.name ?? null, service: inv.serviceType },
    },
    stepIds: Object.fromEntries(run.steps.map((s) => [s.key, s.id])) as Record<InvestigationStepKey, string>,
    startedAt: (inv.startedAt ?? inv.createdAt).getTime(),
  };
}

// ───────────────────────── Recording progress ─────────────────────────

/** Live updates are a nicety: a message that cannot be sent never fails the run (the page re-reads the database). */
async function publishLive(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (err) {
    console.warn("investigation realtime publish failed", err instanceof Error ? err.message : err);
  }
}

/** Tell anyone watching that the run has ended. */
export const announceFinished = (investigationId: string, status: "COMPLETED" | "FAILED" | "CANCELLED") =>
  publishLive(() => inngest.realtime.publish(investigationRunChannel(investigationId).finished, { status, at: Date.now() }));

/** Add a line to the run's timeline, under a step, and push it to anyone watching. */
export async function note(ref: RunRef, key: InvestigationStepKey, type: string, message: string, data?: Prisma.InputJsonValue) {
  await prisma.runEvent.create({ data: { runId: ref.runId, stepId: ref.stepIds[key], type, message, data } });
  await publishLive(() => inngest.realtime.publish(investigationRunChannel(ref.investigationId).update, { kind: "event", step: key, type, message, at: Date.now() }));
}

export async function beginStep(ref: RunRef, key: InvestigationStepKey) {
  const step = await prisma.runStep.findUniqueOrThrow({ where: { id: ref.stepIds[key] }, select: { status: true } });
  await prisma.runStep.update({
    where: { id: ref.stepIds[key] },
    // A step that starts again after a failure is a retry.
    data: { status: "RUNNING", startedAt: new Date(), finishedAt: null, error: null, ...(step.status === "RUNNING" ? { attempt: { increment: 1 } } : {}) },
  });
  await publishLive(() => inngest.realtime.publish(investigationRunChannel(ref.investigationId).update, { kind: "step", step: key, status: "running", at: Date.now() }));
}

export async function finishStep(ref: RunRef, key: InvestigationStepKey, status: Extract<RunStatus, "COMPLETED" | "SKIPPED" | "FAILED">, opts: { output?: Prisma.InputJsonValue; error?: string; startedAt?: number } = {}) {
  const now = new Date();
  await prisma.runStep.update({
    where: { id: ref.stepIds[key] },
    data: { status, finishedAt: now, ...(opts.startedAt ? { durationMs: now.getTime() - opts.startedAt } : {}), ...(opts.error ? { error: opts.error.slice(0, 300) } : {}), ...(opts.output !== undefined ? { output: opts.output } : {}) },
  });
  const done = await prisma.runStep.count({ where: { runId: ref.runId, status: { in: ["COMPLETED", "SKIPPED", "FAILED"] } } });
  await Promise.all([
    prisma.workflowRun.update({ where: { id: ref.runId }, data: { stepsDone: done } }),
    prisma.investigation.update({ where: { id: ref.investigationId }, data: { currentStep: done } }),
  ]);
  await publishLive(() => inngest.realtime.publish(investigationRunChannel(ref.investigationId).update, { kind: "step", step: key, status: status === "COMPLETED" ? "done" : status.toLowerCase(), at: Date.now() }));
}

/** Has the traveller stopped this run? Checked at the start of each step. */
export async function isCancelled(investigationId: string) {
  const inv = await prisma.investigation.findUnique({ where: { id: investigationId }, select: { status: true } });
  return inv?.status === "CANCELLED";
}

// ───────────────────────── Finishing ─────────────────────────

const REASON: Record<string, string> = { domain: "same_domain", upi: "same_upi", phone: "same_phone" };

/**
 * Write everything that depends on the verdict: the result and its sources, the matched business,
 * the identifiers and the matching reports. Safe to run again after a failure (everything is an
 * upsert or a replace). Usage, the notification and COMPLETED come last, in completeInvestigation.
 */
export async function finaliseInvestigation(ref: RunRef, result: AgentResult, ids: Identifiers) {
  const saved = await saveAgentResult(ref.investigationId, result);

  // A verified exact match names the business this investigation is about.
  const match = result.ledger.find((s) => s.kind === "DIRECTORY" && s.meta.exactMatch === true && s.links.propertyId);
  if (match?.links.propertyId) await prisma.investigation.update({ where: { id: ref.investigationId }, data: { matchedPropertyId: match.links.propertyId } });

  // The identifiers the request mentioned, stored masked, so the same seller is recognised next time.
  const wanted: { kind: "DOMAIN" | "PHONE" | "UPI"; value: string; display: string; role: string }[] = [
    ...ids.domains.slice(0, 3).map((d) => ({ kind: "DOMAIN" as const, value: d, display: d, role: "subject" })),
    ...ids.phones.slice(0, 2).map((p) => ({ kind: "PHONE" as const, value: p, display: maskPhone(p), role: "seller_phone" })),
    ...ids.upis.slice(0, 2).map((u) => ({ kind: "UPI" as const, value: u, display: maskUpi(u), role: "seller_upi" })),
  ];
  for (const w of wanted) {
    const row = await prisma.identifier.upsert({ where: { kind_value: { kind: w.kind, value: w.value } }, create: { kind: w.kind, value: w.value, display: w.display, isBusiness: false }, update: {}, select: { id: true } });
    await prisma.investigationIdentifier.upsert({ where: { investigationId_identifierId: { investigationId: ref.investigationId, identifierId: row.id } }, create: { investigationId: ref.investigationId, identifierId: row.id, role: w.role }, update: {} });
  }

  // Reports that name the same website, phone or UPI id, or read like this one.
  const reportMatches = new Map<string, { reason: string; score: number | null }>();
  for (const s of result.ledger) {
    if (s.kind !== "REPORT" || s.unavailable) continue;
    const same = typeof s.meta.sameIdentifier === "string" ? s.meta.sameIdentifier.split("+")[0] : null;
    if (s.links.reportId && same) reportMatches.set(s.links.reportId, { reason: REASON[same] ?? "same_domain", score: null });
  }
  const semantic = result.ledger.filter((s) => s.kind === "REPORT" && s.links.knowledgeDocumentId && !s.links.reportId);
  if (semantic.length) {
    const docs = await prisma.knowledgeDocument.findMany({ where: { id: { in: semantic.map((s) => s.links.knowledgeDocumentId!) }, reportId: { not: null } }, select: { id: true, reportId: true } });
    for (const s of semantic) {
      const doc = docs.find((d) => d.id === s.links.knowledgeDocumentId);
      if (doc?.reportId && !reportMatches.has(doc.reportId)) reportMatches.set(doc.reportId, { reason: "similar_text", score: typeof s.meta.score === "number" ? s.meta.score : null });
    }
  }
  for (const [reportId, m] of reportMatches) {
    await prisma.investigationReportMatch.upsert({ where: { investigationId_reportId: { investigationId: ref.investigationId, reportId } }, create: { investigationId: ref.investigationId, reportId, reason: m.reason, score: m.score }, update: { reason: m.reason, score: m.score } });
  }

  return { resultId: saved.resultId, sources: saved.sourceCount, reportMatches: reportMatches.size, identifiers: wanted.length };
}

/**
 * The last write of a run: usage, the notification and COMPLETED, together in one transaction, so
 * a failure part-way can never count the run twice. Call it after the final step is marked done,
 * so nothing ever sees a completed investigation with an unfinished step.
 */
export async function completeInvestigation(ref: RunRef, verdictSummary: string, verdict: string) {
  const now = new Date();
  const durationMs = now.getTime() - ref.startedAt;
  await prisma.$transaction(async (tx) => {
    const current = await tx.investigation.findUniqueOrThrow({ where: { id: ref.investigationId }, select: { status: true } });
    if (current.status === "COMPLETED") return; // already done: a retry must not count it again
    await tx.usageRecord.upsert({
      where: { userId_metric_periodStart: { userId: ref.userId, metric: INVESTIGATION_METRIC, periodStart: usagePeriodStart(now) } },
      create: { userId: ref.userId, metric: INVESTIGATION_METRIC, periodStart: usagePeriodStart(now), quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    await tx.notification.create({
      data: { userId: ref.userId, type: "run_completed", title: `Check complete: ${ref.title}`, body: verdictSummary.slice(0, 200), href: `/investigate/${ref.investigationId}`, data: { investigationId: ref.investigationId, verdict } },
    });
    await tx.workflowRun.update({ where: { id: ref.runId }, data: { status: "COMPLETED", finishedAt: now, durationMs } });
    await tx.investigation.update({ where: { id: ref.investigationId }, data: { status: "COMPLETED", completedAt: now, durationMs, error: null } });
  });
  await announceFinished(ref.investigationId, "COMPLETED");
}

/** The run could not finish: record why, once, and tell the traveller. */
export async function failInvestigation(investigationId: string, message: string) {
  const inv = await prisma.investigation.findUnique({ where: { id: investigationId }, select: { status: true, userId: true, title: true } });
  if (!inv || inv.status === "COMPLETED" || inv.status === "CANCELLED") return;
  const now = new Date();
  await prisma.investigation.update({ where: { id: investigationId }, data: { status: "FAILED", error: message.slice(0, 300), completedAt: now } });
  await prisma.workflowRun.updateMany({ where: { investigationId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "FAILED", finishedAt: now, error: message.slice(0, 300) } });
  await prisma.runStep.updateMany({ where: { run: { investigationId }, status: "RUNNING" }, data: { status: "FAILED", finishedAt: now } });
  await prisma.runStep.updateMany({ where: { run: { investigationId }, status: "QUEUED" }, data: { status: "SKIPPED" } });
  await announceFinished(investigationId, "FAILED");
  if (inv.status !== "FAILED") {
    await prisma.notification.create({ data: { userId: inv.userId, type: "run_failed", title: `Check could not finish: ${inv.title}`, body: "Something went wrong. You can try again.", href: `/investigate/${investigationId}` } });
  }
}
