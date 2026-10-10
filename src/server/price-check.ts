import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { nameScore } from "@/lib/price";
import { normalizeText } from "@/lib/route-key";
import {
  SERVICE_LABELS,
  VEHICLES,
  type PriceCheckInput,
} from "@/lib/price-schema";
import prisma from "@/lib/prisma";
import { lookupPrice, type PriceLookup } from "./price";
import { getRoute, haversineKm, type LatLng, type Route } from "./routing";

const COMMUNITY_WINDOW_DAYS = 90;

type PlaceRow = { id: string; name: string; aliases: string[]; lat: number; lng: number; districtId: string };

/** Use the place the user picked from the list, else find one that clearly matches the text. */
function resolvePlace(places: PlaceRow[], text: string | undefined, pickedId: string | undefined) {
  if (!text) return null;
  const picked = pickedId ? places.find((p) => p.id === pickedId) : undefined;
  if (picked && normalizeText(picked.name) === normalizeText(text)) return picked;

  const scored = places
    .map((p) => ({ p, score: nameScore(text, [p.name, ...p.aliases]) }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored[1] && scored[1].score === scored[0].score) return null; // ambiguous: do not guess
  return scored[0].p;
}

const vehicleLabel = (v?: string) => VEHICLES.find((x) => x.value === (v ?? "").toUpperCase())?.label.toLowerCase();

function explain(
  input: PriceCheckInput,
  lookup: PriceLookup,
  names: { origin?: string; destination?: string; district?: string },
  communityReports: number,
) {
  if (lookup.band === "NO_REFERENCE") {
    if (lookup.reason === "ambiguous") {
      return input.service === "TAXI"
        ? "More than one route could match what you typed. Pick the places from the list to compare."
        : "More than one tariff applies here. Choose a room type, duration or package to compare.";
    }
    if (lookup.reason === "outdated") {
      return "The tariff we hold for this has expired, so we do not compare against it. Ask to see the posted fare board.";
    }
    return "We have no tariff on file for this yet, so we cannot say whether the quote is fair. Ask to see the posted fare board or compare with another operator.";
  }
  const source = (lookup.details?.sourceLabel ?? "tariff").toLowerCase();
  const subject =
    input.service === "TAXI"
      ? `${names.origin} to ${names.destination}${vehicleLabel(input.vehicle) ? ` ${vehicleLabel(input.vehicle)}` : ""} trips`
      : `${SERVICE_LABELS[input.service].toLowerCase()} prices in ${names.district}${input.qualifier ? ` (${input.qualifier.toLowerCase()})` : ""}`;
  const reports =
    communityReports > 0
      ? `, plus ${communityReports} community price report${communityReports === 1 ? "" : "s"} in the last ${COMMUNITY_WINDOW_DAYS} days`
      : "";
  return `Based on the ${source} sheet for ${subject}${reports}.`;
}

const runCode = () => `run_${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;

/**
 * Run a price check and save it as a completed PRICE investigation (with a small workflow
 * run so it shows up in the run list). Returns the investigation id.
 */
export async function createPriceCheck(userId: string, workspaceId: string, input: PriceCheckInput) {
  const started = Date.now();
  const taxi = input.service === "TAXI";

  const [places, districts] = await Promise.all([
    taxi
      ? prisma.place.findMany({ select: { id: true, name: true, aliases: true, lat: true, lng: true, districtId: true } })
      : Promise.resolve([] as PlaceRow[]),
    prisma.district.findMany({ select: { id: true, name: true } }),
  ]);
  const districtById = new Map(districts.map((d) => [d.id, d.name]));

  const district =
    (input.districtId && districtById.has(input.districtId) ? { id: input.districtId, name: districtById.get(input.districtId)! } : null) ??
    (input.district ? districts.find((d) => normalizeText(d.name) === normalizeText(input.district!)) ?? null : null);

  const origin = taxi ? resolvePlace(places, input.origin, input.originPlaceId) : null;
  const destination = taxi ? resolvePlace(places, input.destination, input.destinationPlaceId) : null;

  const lookup = await lookupPrice({
    service: input.service,
    quotedInr: input.quotedInr,
    origin: input.origin,
    destination: input.destination,
    vehicle: input.vehicle,
    district: district?.name ?? input.district,
    qualifier: input.qualifier,
  });

  // Route: only when both ends are known places.
  let route: Route | null = null;
  if (origin && destination) route = await getRoute(origin as LatLng, destination as LatLng);
  // Prefer the tariff sheet's own distance when routing is unavailable and no estimate exists.
  const distanceKm = route?.distanceKm ?? lookup.details?.distanceKm ?? null;
  const durationMin = route?.durationMin ?? lookup.details?.durationMin ?? null;

  // Community price reports near the route in the last 90 days.
  const reportDistricts = [origin?.districtId, destination?.districtId, district?.id].filter((x): x is string => !!x);
  const communityReports = reportDistricts.length
    ? await prisma.report.count({
        where: {
          kind: "FARE_DISPUTE",
          category: input.service,
          visibility: "PUBLIC",
          deletedAt: null,
          districtId: { in: reportDistricts },
          createdAt: { gte: new Date(Date.now() - COMMUNITY_WINDOW_DAYS * 86_400_000) },
        },
      })
    : 0;

  const names = {
    origin: origin?.name ?? input.origin,
    destination: destination?.name ?? input.destination,
    district: district?.name ?? input.district,
  };
  const explanation = explain(input, lookup, names, communityReports);
  const title = taxi ? `${names.origin} to ${names.destination}` : `${names.district}${input.qualifier ? ` · ${input.qualifier}` : ` · ${SERVICE_LABELS[input.service]}`}`;
  const benchmarkLabel =
    lookup.details?.sourceLabel && lookup.effectiveOn
      ? `${lookup.details.sourceLabel}`
      : null;
  const durationMs = Date.now() - started;

  const stepTitles = [
    ["parse-input", "Understand the request"],
    ["find-benchmark", "Find the tariff range"],
    ["route", "Work out the route"],
    ["classify", "Compare the quote"],
  ] as const;

  const investigation = await prisma.investigation.create({
    data: {
      workspaceId,
      userId,
      kind: "PRICE",
      inputType: "MESSAGE",
      title,
      input: `${title} · quoted Rs ${input.quotedInr}`,
      districtId: district?.id ?? destination?.districtId ?? null,
      serviceType: input.service,
      runResearch: false,
      runCapture: false,
      runKnowledge: false,
      runPrice: true,
      status: "COMPLETED",
      currentStep: stepTitles.length,
      totalSteps: stepTitles.length,
      startedAt: new Date(started),
      completedAt: new Date(),
      durationMs,
      createdVia: "form",
      workflowRuns: {
        create: {
          runCode: runCode(),
          type: "price_check",
          subject: title,
          status: "COMPLETED",
          userId,
          stepsDone: stepTitles.length,
          stepsTotal: stepTitles.length,
          startedAt: new Date(started),
          finishedAt: new Date(),
          durationMs,
          steps: {
            create: stepTitles.map(([key, stepTitle], i) => ({
              order: i,
              key,
              title: stepTitle,
              status: key === "route" && !route ? "SKIPPED" : "COMPLETED",
            })),
          },
        },
      },
      priceCheck: {
        create: {
          serviceType: input.service,
          originText: names.origin ?? names.district ?? "",
          destinationText: names.destination ?? null,
          originPlaceId: origin?.id ?? null,
          destinationPlaceId: destination?.id ?? null,
          districtId: district?.id ?? null,
          vehicle: input.vehicle?.toUpperCase() ?? null,
          qualifier: input.qualifier ?? null,
          quotedInr: input.quotedInr,
          band: lookup.band,
          lowInr: lookup.lowInr,
          highInr: lookup.highInr,
          percentOverHigh: lookup.percentOverHigh,
          benchmarkId: lookup.benchmarkId,
          benchmarkLabel,
          distanceKm: distanceKm,
          durationMin,
          distanceIsApprox: route?.approx ?? false,
          routeVia: lookup.details?.via ?? null,
          routeGeometry: route?.geometry ?? Prisma.JsonNull,
          communityReports,
          communityWindowDays: COMMUNITY_WINDOW_DAYS,
          explanation,
        },
      },
    },
    select: { id: true },
  });
  return investigation.id;
}

export type PriceCheckView = {
  id: string;
  service: "TAXI" | "STAY" | "GUIDE" | "TOUR";
  band: PriceLookup["band"];
  quotedInr: number;
  lowInr: number | null;
  highInr: number | null;
  percentOverHigh: number;
  unit: string | null;
  origin: { name: string; lat: number | null; lng: number | null };
  destination: { name: string; lat: number | null; lng: number | null } | null;
  vehicle: string | null;
  qualifier: string | null;
  districtId: string | null;
  districtName: string | null;
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
  createdAt: string;
};

/** A saved check, only for its owner. */
export async function getPriceCheck(userId: string, investigationId: string): Promise<PriceCheckView | null> {
  const row = await prisma.priceCheck.findFirst({
    where: { investigationId, investigation: { userId, deletedAt: null } },
    include: {
      originPlace: { select: { lat: true, lng: true } },
      destinationPlace: { select: { lat: true, lng: true } },
      benchmark: { select: { unit: true, effectiveOn: true, sourceLabel: true } },
      district: { select: { name: true } },
    },
  });
  if (!row) return null;
  const geometry = Array.isArray(row.routeGeometry) ? (row.routeGeometry as [number, number][]) : null;
  return {
    id: row.investigationId,
    service: row.serviceType as PriceCheckView["service"],
    band: row.band,
    quotedInr: row.quotedInr,
    lowInr: row.lowInr,
    highInr: row.highInr,
    percentOverHigh: row.percentOverHigh ? Number(row.percentOverHigh) : 0,
    unit: row.benchmark?.unit ?? null,
    origin: { name: row.originText, lat: row.originPlace?.lat ?? null, lng: row.originPlace?.lng ?? null },
    destination: row.destinationText
      ? { name: row.destinationText, lat: row.destinationPlace?.lat ?? null, lng: row.destinationPlace?.lng ?? null }
      : null,
    vehicle: row.vehicle,
    qualifier: row.qualifier,
    districtId: row.districtId,
    districtName: row.district?.name ?? null,
    sourceLabel: row.benchmark?.sourceLabel ?? row.benchmarkLabel,
    effectiveOn: row.benchmark?.effectiveOn.toISOString() ?? null,
    distanceKm: row.distanceKm ? Number(row.distanceKm) : null,
    durationMin: row.durationMin,
    distanceIsApprox: row.distanceIsApprox,
    via: row.routeVia,
    geometry,
    communityReports: row.communityReports,
    communityWindowDays: row.communityWindowDays,
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
  };
}

export { haversineKm };
