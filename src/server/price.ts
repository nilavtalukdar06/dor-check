import prisma from "@/lib/prisma";
import { checkPrice, type Benchmark, type PriceQuery, type PriceResult } from "@/lib/price";

export type BenchmarkRow = Awaited<ReturnType<typeof loadBenchmarkRows>>[number];

async function loadBenchmarkRows(service: PriceQuery["service"]) {
  return prisma.tariffBenchmark.findMany({
    where: { serviceType: service, isActive: true, reviewStatus: { not: "rejected" } },
    include: {
      originPlace: { select: { name: true, aliases: true } },
      destinationPlace: { select: { name: true, aliases: true } },
      district: { select: { name: true, aliases: true } },
      board: { select: { name: true } },
    },
  });
}

function toBenchmark(r: BenchmarkRow): Benchmark {
  const destinationNames = r.destinationPlace ? [r.destinationPlace.name, ...r.destinationPlace.aliases] : undefined;
  return {
    id: r.id,
    serviceType: r.serviceType,
    routeKey: r.routeKey,
    originNames: r.originPlace ? [r.originPlace.name, ...r.originPlace.aliases] : undefined,
    destinationNames,
    // Stays, guides and tours match on district names, plus the researched place itself.
    districtNames: [...(r.district ? [r.district.name, ...r.district.aliases] : []), ...(r.serviceType !== "TAXI" ? destinationNames ?? [] : [])],
    vehicle: r.vehicle,
    qualifier: r.qualifier,
    unit: r.unit,
    lowInr: r.lowInr,
    highInr: r.highInr,
    effectiveOn: r.effectiveOn,
    expiresOn: r.expiresOn,
    isActive: r.isActive,
    distanceKm: r.distanceKm ? Number(r.distanceKm) : null,
  };
}

export type PriceLookup = PriceResult & {
  basis: "curated" | "researched" | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  sampleSize: number | null;
  details: {
    distanceKm: number | null;
    durationMin: number | null;
    via: string | null;
    nightSurchargePct: number | null;
    sourceLabel: string | null;
    sourceUrl: string | null;
    boardName: string | null;
  } | null;
  /** All usable tariffs for the service, for fitting distance estimates. */
  benchmarks: Benchmark[];
};

/** Load the tariffs (curated and saved research) and run the pure engine over them. */
export async function lookupPrice(query: PriceQuery): Promise<PriceLookup> {
  const rows = await loadBenchmarkRows(query.service);
  const benchmarks = rows.map(toBenchmark);
  const result = checkPrice(query, benchmarks);
  const row = rows.find((r) => r.id === result.benchmarkId);
  return {
    ...result,
    basis: row ? (row.basis === "researched" ? "researched" : "curated") : null,
    confidence: row ? (row.confidence ?? (row.basis === "researched" ? "MEDIUM" : "HIGH")) : null,
    sampleSize: row?.sampleSize ?? null,
    details: row
      ? {
          distanceKm: row.distanceKm ? Number(row.distanceKm) : null,
          durationMin: row.durationMin,
          via: row.via,
          nightSurchargePct: row.nightSurchargePct,
          sourceLabel: row.sourceLabel,
          sourceUrl: row.sourceUrl,
          boardName: row.board?.name ?? null,
        }
      : null,
    // Estimates are fitted from curated rows only.
    benchmarks: benchmarks.filter((_, i) => rows[i].basis === "curated"),
  };
}

/** Curated taxi tariffs only: the data distance estimates are fitted from. */
export async function loadCuratedBenchmarks(): Promise<Benchmark[]> {
  const rows = await loadBenchmarkRows("TAXI");
  return rows.filter((r) => r.basis === "curated").map(toBenchmark);
}
