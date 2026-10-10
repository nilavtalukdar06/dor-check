import "server-only";

import type { StepStatus } from "@/components/investigation/step-timeline";
import { INVESTIGATION_STEPS, type FoundSource } from "@/lib/investigation";
import prisma from "@/lib/prisma";
import { hostOf } from "@/lib/research-policy";
import { keyFromRef, signedUrl, storageConfigured } from "@/server/storage";

export type RunStepView = {
  key: string;
  title: string;
  status: StepStatus;
  /** "cancelled" or "skipped" when that is what happened; shown where the duration goes. */
  label: string | null;
  durationMs: number | null;
  events: string[];
  tools: string[];
  note: string | null;
};

export type InvestigationView = {
  id: string;
  title: string;
  subject: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "DRAFT";
  startedAt: Date | null;
  runCode: string;
  stepsDone: number;
  totalSteps: number;
  steps: RunStepView[];
  /** Capture was asked for and the step has not ended: the live browser may still appear. */
  watchBrowser: boolean;
  wantsCapture: boolean;
  screenshot: { link: string | null; width: number | null; height: number | null; capturedAt: Date } | null;
  found: FoundSource[];
  error: string | null;
  latest: string | null;
};

function mapStatus(status: string, attempt: number): { status: StepStatus; label: string | null } {
  switch (status) {
    case "RUNNING":
      return { status: attempt > 1 ? "retrying" : "running", label: null };
    case "RETRYING":
      return { status: "retrying", label: null };
    case "COMPLETED":
      return { status: "done", label: null };
    case "SKIPPED":
      return { status: "done", label: "skipped" };
    case "FAILED":
      return { status: "failed", label: null };
    case "CANCELLED":
      return { status: "waiting", label: "cancelled" };
    default:
      return { status: "waiting", label: null };
  }
}

/** The live screen's data, only for the investigation's owner. */
export async function getInvestigationView(userId: string, id: string): Promise<InvestigationView | null> {
  const inv = await prisma.investigation.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      workflowRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { steps: { orderBy: { order: "asc" }, include: { toolCalls: { select: { name: true } }, events: { orderBy: { id: "asc" }, select: { type: true, message: true } } } } },
      },
      evidence: { where: { kind: "SCREENSHOT", deletedAt: null }, orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });
  if (!inv) return null;
  const run = inv.workflowRuns[0];
  const steps: RunStepView[] = INVESTIGATION_STEPS.map(([key, title]) => {
    const s = run?.steps.find((x) => x.key === key);
    if (!s) return { key, title, status: "waiting", label: null, durationMs: null, events: [], tools: [], note: null };
    const mapped = mapStatus(s.status, s.attempt);
    return {
      key,
      title,
      ...mapped,
      durationMs: s.durationMs,
      events: [...new Set(s.events.map((e) => e.type))],
      tools: [...new Set(s.toolCalls.map((t) => t.name))],
      note: mapped.status === "waiting" ? null : (s.events.at(-1)?.message ?? s.error ?? null),
    };
  });

  // What the finished steps found, in the order they ran.
  const found: FoundSource[] = [];
  for (const s of run?.steps ?? []) {
    const list = (s.output as { found?: FoundSource[] } | null)?.found;
    for (const f of list ?? []) if (!found.some((x) => x.title === f.title && x.kind === f.kind)) found.push(f);
  }

  const shot = inv.evidence[0];
  let link: string | null = null;
  if (shot && storageConfigured()) {
    const key = keyFromRef(shot.storageUrl);
    link = key ? await signedUrl(key, 3600).catch(() => null) : null;
  }
  const capture = steps.find((s) => s.key === "capture-page");
  const lastEvent = run?.steps.flatMap((s) => s.events).at(-1);

  return {
    id: inv.id,
    title: inv.title,
    subject: inv.inputType === "LINK" ? hostOf(/^https?:\/\//i.test(inv.input) ? inv.input : `https://${inv.input}`) : inv.title,
    status: inv.status,
    startedAt: inv.startedAt ?? inv.createdAt,
    runCode: run?.runCode ?? "",
    stepsDone: run?.stepsDone ?? 0,
    totalSteps: inv.totalSteps,
    steps,
    wantsCapture: inv.runCapture,
    watchBrowser: inv.runCapture && !!capture && capture.status !== "done" && capture.status !== "failed" && capture.label !== "cancelled",
    screenshot: shot ? { link, width: shot.width, height: shot.height, capturedAt: shot.capturedAt } : null,
    found,
    error: inv.error,
    latest: lastEvent?.message ?? null,
  };
}

// ───────────────────────── The result ─────────────────────────

export type VerdictView = {
  id: string;
  title: string;
  verdict: "VERIFIED_MATCH" | "SUSPICIOUS" | "NO_MATCH" | "INCONCLUSIVE";
  concern: "LOW" | "MEDIUM" | "HIGH";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  guidance: string[];
  limitations: string | null;
  completedAt: Date | null;
  signals: { id: string; kind: "RISK" | "CAUTION" | "POSITIVE"; strength: "STRONG" | "MODERATE" | "WEAK" | "NEUTRAL"; title: string; detail: string; sourceId: string | null }[];
  sources: { id: string; kind: string; title: string; label: string | null; url: string | null; retrievedAt: Date }[];
};

/** A finished investigation's verdict, only for its owner. Null until it has one. */
export async function getVerdictView(userId: string, id: string): Promise<VerdictView | null> {
  const inv = await prisma.investigation.findFirst({
    where: { id, userId, deletedAt: null, result: { isNot: null } },
    include: { result: { include: { signals: { orderBy: { order: "asc" } } } }, sources: { orderBy: { retrievedAt: "asc" } } },
  });
  if (!inv?.result) return null;
  const strength = { STRONG: 0, MODERATE: 1, WEAK: 2, NEUTRAL: 3 } as const;
  return {
    id: inv.id,
    title: inv.title,
    verdict: inv.result.verdict,
    concern: inv.result.concern,
    confidence: inv.result.confidence,
    summary: inv.result.summary,
    guidance: inv.result.guidance,
    limitations: inv.result.limitations,
    completedAt: inv.completedAt,
    signals: [...inv.result.signals].sort((a, b) => strength[a.strength] - strength[b.strength]).map((s) => ({ id: s.id, kind: s.kind, strength: s.strength, title: s.title, detail: s.detail, sourceId: s.sourceId })),
    sources: inv.sources.map((s) => ({ id: s.id, kind: s.kind, title: s.title, label: s.label, url: s.url, retrievedAt: s.retrievedAt })),
  };
}
