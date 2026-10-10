import prisma from "@/lib/prisma";
import { checkPrice, type Benchmark, type PriceQuery, type PriceResult } from "@/lib/price";

export type PriceLookup = PriceResult & {
  /** Route facts and source for the result card; null when there is no reference. */
  details: {
    distanceKm: number | null;
    durationMin: number | null;
    via: string | null;
    nightSurchargePct: number | null;
    sourceLabel: string | null;
    sourceUrl: string | null;
    boardName: string | null;
  } | null;
};

/** Load the tariffs for a service and run the pure engine over them. */
export async function lookupPrice(query: PriceQuery): Promise<PriceLookup> {
  const rows = await prisma.tariffBenchmark.findMany({
    where: { serviceType: query.service, isActive: true },
    include: {
      originPlace: { select: { name: true, aliases: true } },
      destinationPlace: { select: { name: true, aliases: true } },
      district: { select: { name: true, aliases: true } },
      board: { select: { name: true } },
    },
  });

  const benchmarks: Benchmark[] = rows.map((r) => ({
    id: r.id,
    serviceType: r.serviceType,
    routeKey: r.routeKey,
    originNames: r.originPlace ? [r.originPlace.name, ...r.originPlace.aliases] : undefined,
    destinationNames: r.destinationPlace ? [r.destinationPlace.name, ...r.destinationPlace.aliases] : undefined,
    districtNames: r.district ? [r.district.name, ...r.district.aliases] : undefined,
    vehicle: r.vehicle,
    qualifier: r.qualifier,
    unit: r.unit,
    lowInr: r.lowInr,
    highInr: r.highInr,
    effectiveOn: r.effectiveOn,
    expiresOn: r.expiresOn,
    isActive: r.isActive,
  }));

  const result = checkPrice(query, benchmarks);
  const row = rows.find((r) => r.id === result.benchmarkId);
  return {
    ...result,
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
  };
}
