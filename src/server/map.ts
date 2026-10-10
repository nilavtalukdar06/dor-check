import { shortDate, type Bbox, type MapQuery, type MapSignal } from "@/lib/map";
import prisma from "@/lib/prisma";

const PER_LAYER = 150;

const inBox = (bbox?: Bbox) =>
  bbox ? { lat: { gte: bbox[1], lte: bbox[3] }, lng: { gte: bbox[0], lte: bbox[2] } } : {};

const stateWhere = (state?: string) => (state ? { district: { stateCode: state } } : {});

/**
 * Pins for the Explore map: public community reports, directory properties and tariff boards
 * inside the view, plus the filters. Reports show their summary only; reporter identity,
 * phone numbers and UPI ids never leave the server.
 */
export async function getMapSignals(query: MapQuery): Promise<{ signals: MapSignal[]; total: number }> {
  const { bbox, layers, state, days, q } = query;
  const since = days ? new Date(Date.now() - days * 86_400_000) : undefined;

  const [reports, properties, boards] = await Promise.all([
    layers.includes("reports")
      ? prisma.report.findMany({
          where: {
            visibility: "PUBLIC",
            deletedAt: null,
            lat: { not: null },
            lng: { not: null },
            ...(bbox ? { lat: { gte: bbox[1], lte: bbox[3] }, lng: { gte: bbox[0], lte: bbox[2] } } : {}),
            ...stateWhere(state),
            ...(since ? { createdAt: { gte: since } } : {}),
            ...(q
              ? {
                  OR: [
                    { summary: { contains: q, mode: "insensitive" } },
                    { locationText: { contains: q, mode: "insensitive" } },
                    { district: { name: { contains: q, mode: "insensitive" } } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: PER_LAYER,
          select: { reference: true, kind: true, summary: true, lat: true, lng: true, createdAt: true, locationText: true, district: { select: { name: true } } },
        })
      : [],
    layers.includes("properties")
      ? prisma.property.findMany({
          where: {
            isActive: true,
            lat: { not: null },
            lng: { not: null },
            ...(bbox ? { lat: { gte: bbox[1], lte: bbox[3] }, lng: { gte: bbox[0], lte: bbox[2] } } : {}),
            ...stateWhere(state),
            ...(q
              ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { district: { name: { contains: q, mode: "insensitive" } } }] }
              : {}),
          },
          orderBy: [{ verified: "desc" }, { name: "asc" }],
          take: PER_LAYER,
          select: { id: true, slug: true, name: true, type: true, verified: true, lat: true, lng: true, district: { select: { name: true } } },
        })
      : [],
    layers.includes("tariffs")
      ? prisma.tariffBoard.findMany({
          where: {
            isActive: true,
            ...inBox(bbox),
            ...stateWhere(state),
            ...(q
              ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { district: { name: { contains: q, mode: "insensitive" } } }] }
              : {}),
          },
          take: PER_LAYER,
          select: { id: true, name: true, lat: true, lng: true, district: { select: { name: true } } },
        })
      : [],
  ]);

  const signals: MapSignal[] = [
    ...reports.map((r): MapSignal => ({
      id: `report:${r.reference}`,
      layer: "reports",
      kind: r.kind === "FARE_DISPUTE" ? "fare" : "scam",
      title: r.summary,
      subtitle: `${r.locationText ?? r.district.name} · ${shortDate(r.createdAt)}`,
      badge: "Report",
      lat: r.lat!,
      lng: r.lng!,
      href: `/reports/${r.reference}`,
    })),
    ...properties.map((p): MapSignal => ({
      id: `property:${p.id}`,
      layer: "properties",
      kind: p.verified ? "verified" : "listed",
      title: p.name,
      subtitle: `${p.verified ? "Verified" : "Listed"} ${p.type.toLowerCase()} · ${p.district.name}`,
      badge: "Directory",
      lat: p.lat!,
      lng: p.lng!,
      href: `/directory?q=${encodeURIComponent(p.name)}`,
    })),
    ...boards.map((b): MapSignal => ({
      id: `board:${b.id}`,
      layer: "tariffs",
      kind: "board",
      title: b.name,
      subtitle: `Tariff board · ${b.district.name}`,
      badge: "Tariff",
      lat: b.lat,
      lng: b.lng,
      href: "/price",
    })),
  ];
  return { signals, total: signals.length };
}
