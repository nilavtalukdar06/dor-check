import { cacheLife, cacheTag } from "next/cache";
import prisma from "@/lib/prisma";
import type { PlaceSuggestion } from "./geocoding";

export type PriceFormOptions = {
  /** Shown before the user types: the curated places. */
  popularPlaces: PlaceSuggestion[];
  /** Room types, durations and packages we hold tariffs for (free text is allowed too). */
  qualifiers: Record<"STAY" | "GUIDE" | "TOUR", string[]>;
};

/** Reference data for the form. Changes rarely, so it is cached across requests. */
export async function getPriceFormOptions(): Promise<PriceFormOptions> {
  "use cache";
  cacheLife("hours");
  cacheTag("reference-data");

  const [places, tariffs] = await Promise.all([
    prisma.place.findMany({
      where: { source: "seed" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true, lat: true, lng: true, district: { select: { name: true } } },
    }),
    prisma.tariffBenchmark.findMany({
      where: { isActive: true, serviceType: { in: ["STAY", "GUIDE", "TOUR"] }, qualifier: { not: null }, reviewStatus: { not: "rejected" } },
      select: { serviceType: true, qualifier: true },
      distinct: ["serviceType", "qualifier"],
      orderBy: { qualifier: "asc" },
    }),
  ]);

  const qualifiers: PriceFormOptions["qualifiers"] = { STAY: [], GUIDE: [], TOUR: [] };
  for (const t of tariffs) {
    if (t.serviceType === "STAY" || t.serviceType === "GUIDE" || t.serviceType === "TOUR") {
      qualifiers[t.serviceType].push(t.qualifier!);
    }
  }
  return {
    popularPlaces: places.map((p) => ({
      key: `seed:${p.id}`,
      name: p.name,
      detail: p.district?.name ?? "",
      source: "seed",
      placeId: p.id,
      lat: p.lat,
      lng: p.lng,
      kind: p.kind,
    })),
    qualifiers,
  };
}
