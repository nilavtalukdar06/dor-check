import type { PriceBand } from "@/lib/price";
import type { PriceCheckInput } from "@/lib/price-schema";
import prisma from "@/lib/prisma";

export type PriceSource = {
  url: string;
  title: string;
  domain: string | null;
  valueInr: number | null;
  unit: string | null;
  quote: string | null;
  retrievedAt: string;
};

export type PriceCheckView = {
  id: string;
  service: "TAXI" | "STAY" | "GUIDE" | "TOUR";
  band: PriceBand;
  quotedInr: number;
  lowInr: number | null;
  highInr: number | null;
  percentOverHigh: number;
  unit: string | null;
  origin: { name: string; lat: number | null; lng: number | null };
  destination: { name: string; lat: number | null; lng: number | null } | null;
  vehicle: string | null;
  qualifier: string | null;
  sourceLabel: string | null;
  effectiveOn: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  distanceIsApprox: boolean;
  via: string | null;
  geometry: [number, number][] | null;
  communityReports: number;
  communityWindowDays: number;
  explanation: string | null;
  basis: "curated" | "researched" | "estimated" | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  sampleSize: number | null;
  reversed: boolean;
  sources: PriceSource[];
  createdAt: string;
};

export type RunStepView = {
  key: string;
  title: string;
  status: "QUEUED" | "RUNNING" | "RETRYING" | "COMPLETED" | "FAILED" | "CANCELLED" | "SKIPPED";
  durationMs: number | null;
  tools: string[];
};

export type PricePageData =
  | { status: "completed"; id: string; input: PriceCheckInput | null; view: PriceCheckView }
  | { status: "running" | "failed"; id: string; input: PriceCheckInput | null; title: string; steps: RunStepView[] };

/** A saved or in-progress check, only for its owner. */
export async function getPricePage(userId: string, investigationId: string): Promise<PricePageData | null> {
  const inv = await prisma.investigation.findFirst({
    where: { id: investigationId, userId, kind: "PRICE", deletedAt: null },
    include: {
      priceCheck: {
        include: {
          originPlace: { select: { lat: true, lng: true } },
          destinationPlace: { select: { lat: true, lng: true } },
          benchmark: {
            select: {
              unit: true,
              effectiveOn: true,
              sourceLabel: true,
              sources: {
                orderBy: { valueInr: "asc" },
                take: 12,
                select: { url: true, title: true, domain: true, valueInr: true, unit: true, quote: true, retrievedAt: true },
              },
            },
          },
        },
      },
      workflowRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          steps: { orderBy: { order: "asc" }, include: { toolCalls: { select: { name: true } } } },
        },
      },
    },
  });
  if (!inv) return null;

  const run = inv.workflowRuns[0];
  const firstOutput = run?.steps[0]?.output as { input?: PriceCheckInput } | null | undefined;
  const input = firstOutput?.input ?? null;

  const row = inv.priceCheck;
  if (!row) {
    return {
      status: inv.status === "FAILED" ? "failed" : "running",
      id: inv.id,
      input,
      title: inv.title,
      steps: (run?.steps ?? []).map((s) => ({
        key: s.key,
        title: s.title,
        status: s.status,
        durationMs: s.durationMs,
        tools: [...new Set(s.toolCalls.map((t) => t.name))],
      })),
    };
  }

  const geometry = Array.isArray(row.routeGeometry) ? (row.routeGeometry as [number, number][]) : null;
  const usesBenchmark = row.basis === "curated" || row.basis === "researched";
  return {
    status: "completed",
    id: inv.id,
    input,
    view: {
      id: inv.id,
      service: row.serviceType as PriceCheckView["service"],
      band: row.band,
      quotedInr: row.quotedInr,
      lowInr: row.lowInr,
      highInr: row.highInr,
      percentOverHigh: row.percentOverHigh ? Number(row.percentOverHigh) : 0,
      unit: (usesBenchmark ? row.benchmark?.unit : null) ?? defaultUnit(row.serviceType, row.vehicle),
      origin: { name: row.originText, lat: row.originPlace?.lat ?? null, lng: row.originPlace?.lng ?? null },
      destination: row.destinationText
        ? { name: row.destinationText, lat: row.destinationPlace?.lat ?? null, lng: row.destinationPlace?.lng ?? null }
        : null,
      vehicle: row.vehicle,
      qualifier: row.qualifier,
      sourceLabel: row.benchmarkLabel ?? row.benchmark?.sourceLabel ?? null,
      effectiveOn: usesBenchmark ? (row.benchmark?.effectiveOn.toISOString() ?? null) : null,
      distanceKm: row.distanceKm ? Number(row.distanceKm) : null,
      durationMin: row.durationMin,
      distanceIsApprox: row.distanceIsApprox,
      via: row.routeVia,
      geometry,
      communityReports: row.communityReports,
      communityWindowDays: row.communityWindowDays,
      explanation: row.explanation,
      basis: (row.basis as PriceCheckView["basis"]) ?? null,
      confidence: row.confidence,
      sampleSize: row.sampleSize,
      reversed: row.reversed,
      sources:
        row.basis === "researched"
          ? (row.benchmark?.sources ?? [])
              .filter((s) => s.url)
              .map((s) => ({ ...s, url: s.url!, retrievedAt: s.retrievedAt.toISOString() }))
          : [],
      createdAt: row.createdAt.toISOString(),
    },
  };
}

function defaultUnit(service: string, vehicle: string | null) {
  if (service === "TAXI") return vehicle === "SHARED" ? "PER_PERSON" : "PER_TRIP";
  if (service === "STAY") return "PER_NIGHT";
  if (service === "GUIDE") return "PER_DAY";
  return "PER_PERSON";
}
