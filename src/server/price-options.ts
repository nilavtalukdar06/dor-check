import { cacheLife, cacheTag } from "next/cache";
import prisma from "@/lib/prisma";

export type PriceFormOptions = {
  places: { id: string; name: string; kind: string; district: string }[];
  districts: { id: string; name: string; state: string }[];
  /** Room types, durations and packages that have a tariff, per service. */
  qualifiers: Record<"STAY" | "GUIDE" | "TOUR", string[]>;
};

/** Reference data for the form. Changes rarely, so it is cached across requests. */
export async function getPriceFormOptions(): Promise<PriceFormOptions> {
  "use cache";
  cacheLife("hours");
  cacheTag("reference-data");

  const [places, districts, tariffs] = await Promise.all([
    prisma.place.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true, district: { select: { name: true } } },
    }),
    prisma.district.findMany({ orderBy: [{ stateCode: "asc" }, { name: "asc" }], select: { id: true, name: true, stateCode: true } }),
    prisma.tariffBenchmark.findMany({
      where: { isActive: true, serviceType: { in: ["STAY", "GUIDE", "TOUR"] }, qualifier: { not: null } },
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
    places: places.map((p) => ({ id: p.id, name: p.name, kind: p.kind, district: p.district.name })),
    districts: districts.map((d) => ({ id: d.id, name: d.name, state: d.stateCode === "AS" ? "Assam" : "Meghalaya" })),
    qualifiers,
  };
}
