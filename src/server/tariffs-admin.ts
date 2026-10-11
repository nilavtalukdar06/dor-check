import "server-only";

import { z } from "zod";
import { inngest } from "@/inngest/client";
import { sourceSyncRequested } from "@/inngest/events";
import prisma from "@/lib/prisma";
import { routeKey } from "@/lib/route-key";
import { audit } from "@/server/audit";

// Tariff boards and fair-price ranges, managed by moderators. Curated rows are written here;
// researched rows (found by live web research) wait for a moderator to approve or reject them.

const TARIFFS_SOURCE_ID = "internal-tariffs";
export const VEHICLES = ["SEDAN", "SUV", "HATCHBACK", "VAN", "AUTO", "SHARED"] as const;
export const UNITS = ["PER_TRIP", "PER_NIGHT", "PER_DAY", "PER_PERSON"] as const;

/** The knowledge base keeps a copy of tariffs: refresh it after a change. */
async function reindexTariffs(actorId: string) {
  try {
    await inngest.send(sourceSyncRequested.create({ sourceId: TARIFFS_SOURCE_ID, requestedById: actorId }));
  } catch {
    console.warn("tariffs: could not queue the knowledge re-index");
  }
}

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const boardInputSchema = z.object({
  name: z.string().trim().min(3, "Give the board a name").max(120),
  districtId: z.string().min(1, "Choose the district"),
  placeId: z.preprocess(empty, z.string().max(60).optional()),
  lat: z.coerce.number({ error: "Pick the board's place on the map" }).min(-90).max(90),
  lng: z.coerce.number({ error: "Pick the board's place on the map" }).min(-180).max(180),
  notes: z.preprocess(empty, z.string().trim().max(500).optional()),
  lastVerifiedAt: z.preprocess(empty, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date").optional()),
});
export type BoardInput = z.input<typeof boardInputSchema>;

export const benchmarkInputSchema = z
  .object({
    serviceType: z.enum(["TAXI", "STAY", "GUIDE", "TOUR"]),
    originPlaceId: z.preprocess(empty, z.string().optional()),
    destinationPlaceId: z.preprocess(empty, z.string().optional()),
    vehicle: z.preprocess(empty, z.enum(VEHICLES).optional()),
    districtId: z.preprocess(empty, z.string().optional()),
    qualifier: z.preprocess(empty, z.string().trim().max(80).optional()),
    unit: z.enum(UNITS).default("PER_TRIP"),
    lowInr: z.coerce.number({ error: "Enter the lowest fair price" }).int("Whole rupees").min(1, "Above zero"),
    highInr: z.coerce.number({ error: "Enter the highest fair price" }).int("Whole rupees").min(1, "Above zero"),
    boardId: z.preprocess(empty, z.string().optional()),
    sourceLabel: z.string().trim().min(2, "Say where the range comes from").max(80),
    sourceUrl: z.preprocess(empty, z.url("Enter a full web address").optional()),
    effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date"),
    expiresOn: z.preprocess(empty, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.highInr < v.lowInr) ctx.addIssue({ code: "custom", path: ["highInr"], message: "The highest price must be at least the lowest" });
    if (v.serviceType === "TAXI") {
      if (!v.originPlaceId) ctx.addIssue({ code: "custom", path: ["originPlaceId"], message: "Choose where the trip starts" });
      if (!v.destinationPlaceId) ctx.addIssue({ code: "custom", path: ["destinationPlaceId"], message: "Choose where it ends" });
      if (v.originPlaceId && v.originPlaceId === v.destinationPlaceId) ctx.addIssue({ code: "custom", path: ["destinationPlaceId"], message: "Start and end must differ" });
      if (!v.vehicle) ctx.addIssue({ code: "custom", path: ["vehicle"], message: "Choose the vehicle" });
    } else {
      if (!v.districtId) ctx.addIssue({ code: "custom", path: ["districtId"], message: "Choose the district" });
      if (!v.qualifier) ctx.addIssue({ code: "custom", path: ["qualifier"], message: "Say what this price is for (room type, guide hours, package)" });
    }
  });
export type BenchmarkInput = z.input<typeof benchmarkInputSchema>;

type Saved = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
const invalid = (e: z.ZodError): Saved => ({ ok: false, error: "Check the highlighted fields.", fieldErrors: e.flatten().fieldErrors as Record<string, string[]> });

export async function saveBoard(actorId: string, id: string | null, input: BoardInput): Promise<Saved> {
  const p = boardInputSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  const d = p.data;
  const data = { name: d.name, districtId: d.districtId, placeId: d.placeId ?? null, lat: d.lat, lng: d.lng, notes: d.notes ?? null, lastVerifiedAt: d.lastVerifiedAt ? new Date(`${d.lastVerifiedAt}T00:00:00Z`) : null };
  const board = id ? await prisma.tariffBoard.update({ where: { id }, data }) : await prisma.tariffBoard.create({ data });
  await prisma.moderationAction.create({ data: { moderatorId: actorId, targetType: "tariff", targetId: board.id, action: id ? "edit" : "create", after: { board: board.name } } });
  await audit(actorId, id ? "tariff_board.edit" : "tariff_board.create", "TariffBoard", board.id);
  await reindexTariffs(actorId);
  return { ok: true, id: board.id };
}

/** Write a curated range. The lookup key is built the same way as the seed and the price check. */
export async function saveBenchmark(actorId: string, id: string | null, input: BenchmarkInput): Promise<Saved> {
  const p = benchmarkInputSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  const d = p.data;
  let key: string;
  if (d.serviceType === "TAXI") {
    const places = await prisma.place.findMany({ where: { id: { in: [d.originPlaceId!, d.destinationPlaceId!] } }, select: { id: true, name: true } });
    const name = (pid: string) => places.find((x) => x.id === pid)?.name;
    if (!name(d.originPlaceId!) || !name(d.destinationPlaceId!)) return { ok: false, error: "One of the places no longer exists." };
    key = routeKey(name(d.originPlaceId!), name(d.destinationPlaceId!), d.vehicle);
  } else {
    const district = await prisma.district.findUnique({ where: { id: d.districtId! }, select: { name: true } });
    if (!district) return { ok: false, error: "Choose a district from the list." };
    key = routeKey(district.name, d.qualifier);
  }
  const taxi = d.serviceType === "TAXI";
  const data = {
    serviceType: d.serviceType,
    routeKey: key,
    originPlaceId: taxi ? d.originPlaceId! : null,
    destinationPlaceId: taxi ? d.destinationPlaceId! : null,
    vehicle: taxi ? d.vehicle! : null,
    districtId: taxi ? null : d.districtId!,
    qualifier: taxi ? null : d.qualifier!,
    unit: d.unit,
    lowInr: d.lowInr,
    highInr: d.highInr,
    boardId: d.boardId ?? null,
    sourceLabel: d.sourceLabel,
    sourceUrl: d.sourceUrl ?? null,
    effectiveOn: new Date(`${d.effectiveOn}T00:00:00Z`),
    expiresOn: d.expiresOn ? new Date(`${d.expiresOn}T00:00:00Z`) : null,
    basis: "curated",
    confidence: "HIGH" as const,
    reviewStatus: "approved",
    isActive: true,
  };
  const row = id ? await prisma.tariffBenchmark.update({ where: { id }, data }) : await prisma.tariffBenchmark.create({ data });
  await prisma.moderationAction.create({ data: { moderatorId: actorId, targetType: "tariff", targetId: row.id, action: id ? "edit" : "create", after: { routeKey: key, lowInr: d.lowInr, highInr: d.highInr } } });
  await audit(actorId, id ? "tariff.edit" : "tariff.create", "TariffBenchmark", row.id, { routeKey: key });
  await reindexTariffs(actorId);
  return { ok: true, id: row.id };
}

/** Take a range out of use (kept for history). */
export async function retireBenchmark(actorId: string, id: string) {
  await prisma.tariffBenchmark.update({ where: { id }, data: { isActive: false } });
  await prisma.moderationAction.create({ data: { moderatorId: actorId, targetType: "tariff", targetId: id, action: "delete" } });
  await audit(actorId, "tariff.retire", "TariffBenchmark", id);
  await reindexTariffs(actorId);
}

/** Approve or reject a researched range. Approved researched ranges stay "researched" (medium confidence). */
export async function decideResearched(actorId: string, id: string, approve: boolean, note?: string) {
  const row = await prisma.tariffBenchmark.findUniqueOrThrow({ where: { id }, select: { reviewStatus: true, basis: true } });
  if (row.basis !== "researched" || row.reviewStatus !== "pending") throw new Error("This range is not waiting for review.");
  await prisma.tariffBenchmark.update({ where: { id }, data: { reviewStatus: approve ? "approved" : "rejected", ...(approve ? {} : { isActive: false }) } });
  await prisma.moderationAction.create({ data: { moderatorId: actorId, targetType: "tariff", targetId: id, action: approve ? "approve_research" : "reject_research", note: note?.slice(0, 300) || null } });
  await audit(actorId, approve ? "tariff.approve_research" : "tariff.reject_research", "TariffBenchmark", id);
  await reindexTariffs(actorId);
}

// ───────────────────────── Reading ─────────────────────────

export type TariffRow = { id: string; service: string; title: string; unit: string; lowInr: number; highInr: number; sourceLabel: string | null; sourceUrl: string | null; board: string | null; effectiveOn: Date; basis: string; reviewStatus: string; isDemo: boolean; edit: RangeEdit };
/** A range as the edit form holds it: every field a string. */
export type RangeEdit = { id: string; serviceType: "TAXI" | "STAY" | "GUIDE" | "TOUR"; originPlaceId: string; destinationPlaceId: string; vehicle: string; districtId: string; qualifier: string; unit: string; lowInr: string; highInr: string; boardId: string; sourceLabel: string; sourceUrl: string; effectiveOn: string; expiresOn: string };
export type ResearchedRow = { id: string; service: string; title: string; unit: string; lowInr: number; highInr: number; sampleSize: number | null; researchedAt: Date | null; sources: { url: string | null; title: string; quote: string | null; valueInr: number | null }[] };
export type BoardRow = { id: string; name: string; districtId: string; districtName: string; lat: number; lng: number; notes: string | null; lastVerifiedAt: Date | null; rangeCount: number; isDemo: boolean };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const titleOf = (b: { serviceType: string; vehicle: string | null; qualifier: string | null; originPlace: { name: string } | null; destinationPlace: { name: string } | null; district: { name: string } | null }) =>
  b.serviceType === "TAXI" ? `${b.originPlace?.name ?? "?"} to ${b.destinationPlace?.name ?? "?"}${b.vehicle ? ` · ${b.vehicle.toLowerCase()}` : ""}` : `${b.district?.name ?? "?"} · ${b.qualifier ?? b.serviceType.toLowerCase()}`;

export async function getTariffAdmin() {
  const [boards, curated, researched, places, districts] = await Promise.all([
    prisma.tariffBoard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, include: { district: { select: { name: true } }, _count: { select: { benchmarks: true } } } }),
    prisma.tariffBenchmark.findMany({
      where: { isActive: true, basis: "curated" },
      orderBy: [{ serviceType: "asc" }, { routeKey: "asc" }],
      take: 300,
      include: { originPlace: { select: { name: true } }, destinationPlace: { select: { name: true } }, district: { select: { name: true } }, board: { select: { name: true } } },
    }),
    prisma.tariffBenchmark.findMany({
      where: { isActive: true, basis: "researched", reviewStatus: "pending" },
      orderBy: { researchedAt: "desc" },
      take: 50,
      include: { originPlace: { select: { name: true } }, destinationPlace: { select: { name: true } }, district: { select: { name: true } }, sources: { take: 6, select: { url: true, title: true, quote: true, valueInr: true } } },
    }),
    prisma.place.findMany({ where: { source: "seed" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.district.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    boards: boards.map((b): BoardRow => ({ id: b.id, name: b.name, districtId: b.districtId, districtName: b.district.name, lat: b.lat, lng: b.lng, notes: b.notes, lastVerifiedAt: b.lastVerifiedAt, rangeCount: b._count.benchmarks, isDemo: b.isDemo })),
    curated: curated.map((b): TariffRow => ({
      id: b.id, service: b.serviceType, title: titleOf(b), unit: b.unit, lowInr: b.lowInr, highInr: b.highInr, sourceLabel: b.sourceLabel, sourceUrl: b.sourceUrl, board: b.board?.name ?? null, effectiveOn: b.effectiveOn, basis: b.basis, reviewStatus: b.reviewStatus, isDemo: b.isDemo,
      edit: { id: b.id, serviceType: b.serviceType as RangeEdit["serviceType"], originPlaceId: b.originPlaceId ?? "", destinationPlaceId: b.destinationPlaceId ?? "", vehicle: b.vehicle ?? "SEDAN", districtId: b.districtId ?? "", qualifier: b.qualifier ?? "", unit: b.unit, lowInr: String(b.lowInr), highInr: String(b.highInr), boardId: b.boardId ?? "", sourceLabel: b.sourceLabel ?? "", sourceUrl: b.sourceUrl ?? "", effectiveOn: iso(b.effectiveOn), expiresOn: iso(b.expiresOn) },
    })),
    researched: researched.map((b): ResearchedRow => ({ id: b.id, service: b.serviceType, title: titleOf(b), unit: b.unit, lowInr: b.lowInr, highInr: b.highInr, sampleSize: b.sampleSize, researchedAt: b.researchedAt, sources: b.sources })),
    places,
    districts,
  };
}
