import "server-only";

import type { StepStatus } from "@/components/investigation/step-timeline";
import { INVESTIGATION_STEPS, type FoundSource } from "@/lib/investigation";
import { KIND_COLOR } from "@/lib/map";
import { withBaselineGuidance } from "@/lib/verdict";
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

export type VerdictSignal = {
  id: string;
  kind: "RISK" | "CAUTION" | "POSITIVE";
  strength: "STRONG" | "MODERATE" | "WEAK" | "NEUTRAL";
  title: string;
  detail: string;
  /** Numbers of the sources that support it (the position in `sources`, from 1). */
  sourceNos: number[];
};

export type VerdictSource = { no: number; id: string; kind: string; title: string; label: string | null; url: string | null; retrievedAt: Date };

/** What the verdict says, without anything private: safe to show to anyone the owner shares it with. */
export type VerdictCore = {
  title: string;
  verdict: "VERIFIED_MATCH" | "SUSPICIOUS" | "NO_MATCH" | "INCONCLUSIVE";
  concern: "LOW" | "MEDIUM" | "HIGH";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  guidance: string[];
  limitations: string | null;
  completedAt: Date | null;
  signals: VerdictSignal[];
  sources: VerdictSource[];
};

export type VerdictView = VerdictCore & {
  id: string;
  inputType: string;
  /** The link, name, message or contact the traveller entered. Private. */
  input: string;
  createdAt: Date;
  districtName: string | null;
  evidence: { id: string; kind: "SCREENSHOT" | "EXTRACT" | "UPLOAD" | "AUDIO" | "DOCUMENT"; title: string; capturedBy: string; capturedAt: Date; thumbnail: string | null }[];
  map: { markers: { lat: number; lng: number; color: string; label?: string }[]; caption: string | null } | null;
  share: { isPublic: boolean; token: string | null };
  reportMatches: number;
};

const STRENGTH_ORDER = { STRONG: 0, MODERATE: 1, WEAK: 2, NEUTRAL: 3 } as const;

type RawOutput = { signals?: { sourceIds?: string[] }[]; ledgerToSource?: Record<string, string> } | null;

/** Turn the saved result into what the page shows: signals with their sources, strongest first. */
function buildCore(
  inv: {
    title: string;
    completedAt: Date | null;
    result: { verdict: VerdictCore["verdict"]; concern: VerdictCore["concern"]; confidence: VerdictCore["confidence"]; summary: string; guidance: string[]; limitations: string | null; rawOutput: unknown; signals: { id: string; order: number; kind: VerdictSignal["kind"]; strength: VerdictSignal["strength"]; title: string; detail: string; sourceId: string | null }[] };
    sources: { id: string; kind: string; title: string; label: string | null; url: string | null; retrievedAt: Date }[];
  },
  opts: { hidePrivateSources: boolean },
): VerdictCore {
  const raw = inv.result.rawOutput as RawOutput;
  // The traveller's own message is a citable source for them, but never shown to anyone else.
  const rows = inv.sources.filter((s) => !(opts.hidePrivateSources && s.kind === "USER"));
  const no = new Map(rows.map((s, i) => [s.id, i + 1]));
  const signals = [...inv.result.signals]
    .sort((a, b) => a.order - b.order)
    .map((s, i): VerdictSignal => {
      const ledger = raw?.signals?.[i]?.sourceIds ?? [];
      const rowIds = ledger.map((l) => raw?.ledgerToSource?.[l]).filter((x): x is string => !!x);
      const ids = rowIds.length ? rowIds : s.sourceId ? [s.sourceId] : [];
      return { id: s.id, kind: s.kind, strength: s.strength, title: s.title, detail: s.detail, sourceNos: [...new Set(ids.map((x) => no.get(x)).filter((n): n is number => !!n))] };
    })
    .sort((a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength]);
  return {
    title: inv.title,
    verdict: inv.result.verdict,
    concern: inv.result.concern,
    confidence: inv.result.confidence,
    summary: inv.result.summary,
    // Results saved before the baseline rule existed get it too.
    guidance: withBaselineGuidance(inv.result.guidance),
    limitations: inv.result.limitations,
    completedAt: inv.completedAt,
    signals,
    sources: rows.map((s, i) => ({ no: i + 1, id: s.id, kind: s.kind, title: s.title, label: s.label, url: s.url, retrievedAt: s.retrievedAt })),
  };
}

const EVIDENCE_BY: Record<string, string> = { browserbase: "Browserbase", firecrawl: "Firecrawl", user: "You", sarvam: "Sarvam" };

/** A finished investigation's verdict, only for its owner. Null until it has one. */
export async function getVerdictView(userId: string, id: string): Promise<VerdictView | null> {
  const inv = await prisma.investigation.findFirst({
    where: { id, userId, deletedAt: null, result: { isNot: null } },
    include: {
      result: { include: { signals: true } },
      sources: { orderBy: { retrievedAt: "asc" } },
      district: { select: { name: true, lat: true, lng: true } },
      matchedProperty: { select: { name: true, lat: true, lng: true } },
      reportMatches: { include: { report: { select: { reference: true, lat: true, lng: true } } }, take: 8 },
      evidence: { where: { deletedAt: null }, orderBy: { capturedAt: "asc" } },
    },
  });
  if (!inv?.result) return null;

  const evidence = await Promise.all(
    inv.evidence.map(async (e) => {
      const key = keyFromRef(e.storageUrl);
      const thumb = e.mimeType.startsWith("image/") && key && storageConfigured() ? await signedUrl(key, 3600).catch(() => null) : null;
      return { id: e.id, kind: e.kind, title: e.title, capturedBy: EVIDENCE_BY[e.capturedBy] ?? e.capturedBy, capturedAt: e.capturedAt, thumbnail: thumb };
    }),
  );

  // Map: the matched business if there is one, else the district; plus where matching reports are.
  const markers: NonNullable<VerdictView["map"]>["markers"] = [];
  const prop = inv.matchedProperty;
  if (prop?.lat != null && prop.lng != null) markers.push({ lat: prop.lat, lng: prop.lng, color: KIND_COLOR.verified, label: prop.name });
  else if (inv.district) markers.push({ lat: inv.district.lat, lng: inv.district.lng, color: KIND_COLOR.listed, label: inv.district.name });
  for (const m of inv.reportMatches) if (m.report.lat != null && m.report.lng != null) markers.push({ lat: m.report.lat, lng: m.report.lng, color: KIND_COLOR.scam, label: m.report.reference });

  return {
    ...buildCore({ ...inv, result: inv.result }, { hidePrivateSources: false }),
    id: inv.id,
    inputType: inv.inputType,
    input: inv.input,
    createdAt: inv.createdAt,
    districtName: inv.district?.name ?? null,
    evidence,
    map: markers.length ? { markers, caption: inv.district?.name ?? null } : null,
    share: { isPublic: inv.isPublic, token: inv.shareToken },
    reportMatches: inv.reportMatches.length,
  };
}

/** The verdict behind a share link: only if the owner switched sharing on. Nothing private comes with it. */
export async function getSharedVerdict(token: string): Promise<VerdictCore | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const inv = await prisma.investigation.findFirst({
    where: { shareToken: token, isPublic: true, deletedAt: null, status: "COMPLETED", result: { isNot: null } },
    include: { result: { include: { signals: true } }, sources: { orderBy: { retrievedAt: "asc" } } },
  });
  if (!inv?.result) return null;
  return buildCore({ ...inv, result: inv.result }, { hidePrivateSources: true });
}
