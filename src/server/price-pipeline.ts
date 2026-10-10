import { randomBytes } from "node:crypto";
import { Prisma, type RunStatus } from "@/generated/prisma/client";
import type { PriceProgress, PriceStepKey } from "@/inngest/channels";
import { classifyQuote, estimateTaxiRange, type PriceBand, type TaxiEstimate } from "@/lib/price";
import { SERVICE_LABELS, VEHICLES, type PriceCheckInput } from "@/lib/price-schema";
import { routeKey } from "@/lib/route-key";
import prisma from "@/lib/prisma";
import { resolvePlace, type ResolvedPlace } from "./geocoding";
import { loadCuratedBenchmarks, lookupPrice, type PriceLookup } from "./price";
import {
  describeSubject,
  researchConfigured,
  unitFor,
  type ResearchResult,
  type ResearchSubject,
  type ToolLog,
} from "./price-research";
import { consumeRateLimit } from "./rate-limit";
import { getRoute, type Route } from "./routing";

// The six steps of a price check as plain functions. The Inngest workflow
// (src/inngest/functions/price-check.ts) calls each one inside step.run, so every input and
// output here is JSON-serialisable (no Dates, no class instances).
//
// Each function also records itself on RunStep / RunEvent rows, which is what a reloaded page
// reads. Live updates go out separately through Inngest Realtime.

export const COMMUNITY_WINDOW_DAYS = 90;
export const RESEARCH_TTL_DAYS = 30;
const RESEARCH_PER_HOUR = 10;

export const STEPS = [
  ["resolve-places", "Find the places"],
  ["route", "Work out the route"],
  ["find-tariff", "Look for a known tariff"],
  ["research", "Search public prices"],
  ["estimate", "Estimate from distance"],
  ["compare", "Compare your quote"],
] as const satisfies readonly (readonly [PriceStepKey, string])[];

type Basis = "curated" | "researched" | "estimated";
type Level = "HIGH" | "MEDIUM" | "LOW";

/** Everything a step needs to know about the run. Loaded once, passed around as JSON. */
export type RunRef = {
  investigationId: string;
  runId: string;
  userId: string;
  input: PriceCheckInput;
  stepIds: Record<PriceStepKey, string>;
  /** Epoch ms when the check was created. */
  started: number;
};

export type Publish = (message: Omit<PriceProgress, "at">) => Promise<void>;

export type PlacesState = {
  origin: ResolvedPlace | null;
  destination: ResolvedPlace | null;
  location: ResolvedPlace | null;
};

/** The tariff lookup as plain JSON. */
export type TariffState = Omit<PriceLookup, "benchmarks" | "effectiveOn"> & { effectiveOn: string | null };

const runCode = () => `run_${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;
const vehicleLabel = (v?: string) => VEHICLES.find((x) => x.value === (v ?? "").toUpperCase())?.label.toLowerCase();
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

// ───────────────────────── Creating a run ─────────────────────────

/** Create the investigation, workflow run and its six steps. The workflow does the rest. */
export async function createPriceRun(userId: string, workspaceId: string, input: PriceCheckInput) {
  const provisional = input.service === "TAXI" ? `${input.origin} to ${input.destination}` : `${input.location ?? input.district}`;
  const started = new Date();

  const investigation = await prisma.investigation.create({
    data: {
      workspaceId,
      userId,
      kind: "PRICE",
      inputType: "MESSAGE",
      title: provisional,
      input: `${provisional} · quoted Rs ${input.quotedInr}`,
      serviceType: input.service,
      runResearch: true,
      runCapture: false,
      runKnowledge: true,
      runPrice: true,
      status: "RUNNING",
      totalSteps: STEPS.length,
      startedAt: started,
      createdVia: "form",
      workflowRuns: {
        create: {
          runCode: runCode(),
          type: "price_check",
          subject: provisional,
          status: "QUEUED",
          userId,
          stepsTotal: STEPS.length,
          startedAt: started,
          steps: {
            create: STEPS.map(([key, title], order) => ({
              order,
              key,
              title,
              // The original request lives on the first step so a reload can refill the form.
              output: order === 0 ? ({ input } as Prisma.InputJsonValue) : undefined,
            })),
          },
        },
      },
    },
    select: { id: true },
  });
  return investigation.id;
}

/** Load a run for the workflow. */
export async function loadRunRef(investigationId: string): Promise<RunRef> {
  const inv = await prisma.investigation.findUniqueOrThrow({
    where: { id: investigationId },
    include: {
      workflowRuns: { orderBy: { createdAt: "desc" }, take: 1, include: { steps: { orderBy: { order: "asc" } } } },
    },
  });
  const run = inv.workflowRuns[0];
  const first = run.steps[0]?.output as { input?: PriceCheckInput } | null;
  if (!first?.input) throw new Error("Price check has no stored input");
  await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });
  return {
    investigationId,
    runId: run.id,
    userId: inv.userId,
    input: first.input,
    stepIds: Object.fromEntries(run.steps.map((s) => [s.key, s.id])) as Record<PriceStepKey, string>,
    started: (inv.startedAt ?? inv.createdAt).getTime(),
  };
}

// ───────────────────────── Recording progress ─────────────────────────

async function event(ref: RunRef, type: string, message: string, step: PriceStepKey, data?: Prisma.InputJsonValue) {
  await prisma.runEvent.create({ data: { runId: ref.runId, stepId: ref.stepIds[step], type, message, data } });
}

/** Mark a step in the database and push the same news to anyone watching live. */
async function mark(
  ref: RunRef,
  publish: Publish,
  step: PriceStepKey,
  status: Extract<RunStatus, "RUNNING" | "COMPLETED" | "SKIPPED" | "FAILED">,
  opts: { output?: Prisma.InputJsonValue; message?: string; startedAt?: number } = {},
) {
  const now = new Date();
  const finished = status !== "RUNNING";
  const durationMs = finished && opts.startedAt ? now.getTime() - opts.startedAt : undefined;
  await prisma.runStep.update({
    where: { id: ref.stepIds[step] },
    data: {
      status,
      ...(status === "RUNNING" ? { startedAt: now } : { finishedAt: now }),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(opts.output !== undefined ? { output: opts.output } : {}),
    },
  });
  if (finished) {
    const done = await prisma.runStep.count({ where: { runId: ref.runId, status: { in: ["COMPLETED", "SKIPPED", "FAILED"] } } });
    await Promise.all([
      prisma.workflowRun.update({ where: { id: ref.runId }, data: { stepsDone: done } }),
      prisma.investigation.update({ where: { id: ref.investigationId }, data: { currentStep: done } }),
    ]);
  }
  await publish({
    step,
    status: status === "RUNNING" ? "running" : status === "COMPLETED" ? "done" : status === "SKIPPED" ? "skipped" : "failed",
    message: opts.message,
    durationMs,
  });
}

/** Tool calls (Firecrawl, Gemini) are logged against the research step. */
export const toolLogger =
  (ref: RunRef): ToolLog =>
  async (c) => {
    await prisma.toolCall.create({
      data: {
        runId: ref.runId,
        stepId: ref.stepIds.research,
        name: c.name,
        input: c.input as Prisma.InputJsonValue,
        output: (c.output ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        status: c.ok ? "COMPLETED" : "FAILED",
        error: c.error?.slice(0, 500),
        durationMs: c.durationMs,
      },
    });
  };

// ───────────────────────── Helpers ─────────────────────────

function names(ref: RunRef, places: PlacesState) {
  const i = ref.input;
  return {
    origin: places.origin?.name ?? i.origin,
    destination: places.destination?.name ?? i.destination,
    location: places.location?.name ?? i.location ?? i.district,
    district: places.location?.districtName ?? i.district,
  };
}

export function researchSubject(ref: RunRef, places: PlacesState, route: Route | null): ResearchSubject {
  const n = names(ref, places);
  return {
    service: ref.input.service,
    origin: n.origin,
    destination: n.destination,
    location: n.location,
    qualifier: ref.input.qualifier,
    vehicle: ref.input.vehicle,
    distanceKm: route?.distanceKm ?? null,
  };
}

function titleFor(ref: RunRef, places: PlacesState) {
  const n = names(ref, places);
  if (ref.input.service === "TAXI") return `${n.origin} to ${n.destination}`;
  return `${n.location} · ${ref.input.qualifier ?? SERVICE_LABELS[ref.input.service]}`;
}

// ───────────────────────── The steps ─────────────────────────

export async function resolvePlacesStep(ref: RunRef, publish: Publish): Promise<PlacesState> {
  const t = Date.now();
  await mark(ref, publish, "resolve-places", "RUNNING");
  const i = ref.input;
  const places: PlacesState = { origin: null, destination: null, location: null };
  if (i.service === "TAXI") {
    [places.origin, places.destination] = await Promise.all([
      resolvePlace(i.origin, i.originPlaceId, i.originGeo),
      resolvePlace(i.destination, i.destinationPlaceId, i.destinationGeo),
    ]);
  } else {
    places.location = await resolvePlace(i.location ?? i.district, i.locationPlaceId, i.locationGeo);
    if (!places.location && i.districtId) {
      const d = await prisma.district.findUnique({ where: { id: i.districtId } });
      if (d) places.location = { id: "", name: d.name, fullName: null, lat: d.lat, lng: d.lng, districtId: d.id, districtName: d.name, aliases: d.aliases };
    }
  }

  const found = [places.origin, places.destination, places.location].filter(Boolean).map((p) => p!.name);
  const title = titleFor(ref, places);
  const message = found.length ? `Found ${found.join(" and ")}` : "Could not place this on the map";
  await Promise.all([
    prisma.investigation.update({
      where: { id: ref.investigationId },
      data: {
        title,
        input: `${title} · quoted Rs ${i.quotedInr}`,
        districtId: places.destination?.districtId ?? places.location?.districtId ?? places.origin?.districtId ?? null,
      },
    }),
    prisma.workflowRun.update({ where: { id: ref.runId }, data: { subject: title } }),
    event(ref, "places_resolved", message, "resolve-places"),
  ]);
  // The first step's output also holds the original request, so keep it.
  await mark(ref, publish, "resolve-places", "COMPLETED", {
    startedAt: t,
    message,
    output: { input: ref.input, found } as Prisma.InputJsonValue,
  });
  return places;
}

export async function routeStep(ref: RunRef, places: PlacesState, publish: Publish): Promise<Route | null> {
  if (ref.input.service !== "TAXI" || !places.origin || !places.destination) {
    await mark(ref, publish, "route", "SKIPPED");
    return null;
  }
  const t = Date.now();
  await mark(ref, publish, "route", "RUNNING");
  const route = await getRoute(places.origin, places.destination);
  const message = `${route.approx ? "About " : ""}${route.distanceKm} km by road`;
  await event(ref, "route_found", message, "route");
  await mark(ref, publish, "route", "COMPLETED", {
    startedAt: t,
    message,
    output: { distanceKm: route.distanceKm, durationMin: route.durationMin, approx: route.approx },
  });
  return route;
}

export async function tariffStep(ref: RunRef, places: PlacesState, publish: Publish): Promise<TariffState> {
  const t = Date.now();
  await mark(ref, publish, "find-tariff", "RUNNING");
  const n = names(ref, places);
  const { benchmarks: _benchmarks, effectiveOn, ...rest } = await lookupPrice({
    service: ref.input.service,
    quotedInr: ref.input.quotedInr,
    origin: n.origin,
    destination: n.destination,
    vehicle: ref.input.vehicle,
    district: n.district ?? n.location,
    qualifier: ref.input.qualifier,
  });
  void _benchmarks;
  const lookup: TariffState = { ...rest, effectiveOn: effectiveOn ? effectiveOn.toISOString() : null };

  const hit = lookup.band !== "NO_REFERENCE";
  const message = hit
    ? `${lookup.basis === "researched" ? "Saved research" : "Curated tariff"} found${lookup.reversed ? " (opposite direction)" : ""}`
    : "No known tariff for this yet";
  await event(ref, hit ? "benchmark_found" : "benchmark_missing", message, "find-tariff");
  await mark(ref, publish, "find-tariff", "COMPLETED", {
    startedAt: t,
    message,
    output: { found: hit, basis: lookup.basis, reversed: lookup.reversed },
  });
  return lookup;
}

/** Decide whether web research may run (configured, and within the hourly limit). */
export async function researchGate(ref: RunRef, publish: Publish): Promise<{ allowed: boolean; reason?: string }> {
  if (!researchConfigured()) {
    await skipResearch(ref, publish, "not_configured", "Web research is not configured");
    return { allowed: false, reason: "not_configured" };
  }
  if (!(await consumeRateLimit(`price-research:${ref.userId}`, RESEARCH_PER_HOUR, 3600))) {
    await skipResearch(ref, publish, "rate_limited", "Research limit reached for this hour");
    return { allowed: false, reason: "rate_limited" };
  }
  return { allowed: true };
}

async function skipResearch(ref: RunRef, publish: Publish, reason: string, message: string) {
  await event(ref, "research_skipped", message, "research");
  await mark(ref, publish, "research", "SKIPPED", { output: { reason }, message });
}

export async function researchStarted(ref: RunRef, places: PlacesState, route: Route | null, publish: Publish) {
  const message = `Searching public prices for ${describeSubject(researchSubject(ref, places, route))}`;
  await mark(ref, publish, "research", "RUNNING", { message });
  await event(ref, "research_started", message, "research");
}

export async function researchNote(ref: RunRef, publish: Publish, type: string, message: string) {
  await event(ref, type, message, "research");
  await publish({ step: "research", status: "progress", message });
}

export async function researchFinished(ref: RunRef, publish: Publish, research: ResearchResult, startedAt: number) {
  const sites = new Set(research.kept.map((o) => o.domain)).size;
  const message = research.ok
    ? `${research.kept.length} prices from ${sites} sites agree`
    : research.pagesRead
      ? `Too few matching prices on ${research.pagesRead} pages`
      : "No public pages found";
  await event(ref, research.ok ? "sources_found" : "sources_thin", message, "research");
  await mark(ref, publish, "research", "COMPLETED", {
    startedAt,
    message,
    output: { ...research.stats, sources: research.kept.length, ...(research.ok ? {} : { reason: research.reason }) } as Prisma.InputJsonValue,
  });
}

export async function researchFailed(ref: RunRef, publish: Publish, startedAt: number) {
  await event(ref, "research_failed", "Research could not finish; using what we have", "research");
  await mark(ref, publish, "research", "FAILED", { startedAt, message: "Research could not finish" });
}

/** Save a successful research result as a pending tariff with its evidence. */
export async function saveResearchStep(
  ref: RunRef,
  places: PlacesState,
  route: Route | null,
  research: Extract<ResearchResult, { ok: true }>,
): Promise<string> {
  const taxi = ref.input.service === "TAXI";
  const n = names(ref, places);
  const key = taxi ? routeKey(n.origin, n.destination, ref.input.vehicle) : routeKey(n.location, ref.input.qualifier);
  const effectiveOn = today();
  const data = {
    serviceType: ref.input.service,
    routeKey: key,
    originPlaceId: taxi ? places.origin?.id || null : null,
    destinationPlaceId: taxi ? places.destination?.id || null : places.location?.id || null,
    districtId: (taxi ? places.destination?.districtId : places.location?.districtId) ?? null,
    vehicle: taxi ? (ref.input.vehicle?.toUpperCase() ?? null) : null,
    qualifier: taxi ? null : (ref.input.qualifier ?? null),
    unit: research.unit,
    lowInr: research.lowInr,
    highInr: research.highInr,
    distanceKm: route?.distanceKm ?? null,
    durationMin: route?.durationMin ?? null,
    basis: "researched",
    confidence: "MEDIUM" as const,
    sampleSize: research.kept.length,
    reviewStatus: "pending",
    researchedAt: new Date(),
    sourceLabel: "Researched prices",
    effectiveOn,
    expiresOn: new Date(effectiveOn.getTime() + RESEARCH_TTL_DAYS * 86_400_000),
    isActive: true,
  };
  const benchmark = await prisma.tariffBenchmark.upsert({
    where: { routeKey_effectiveOn: { routeKey: key, effectiveOn } },
    create: data,
    update: data,
  });
  await prisma.source.deleteMany({ where: { benchmarkId: benchmark.id } });
  await prisma.source.createMany({
    data: research.kept.map((o) => ({
      // Evidence belongs to the saved tariff, not to this check, so it outlives the check.
      benchmarkId: benchmark.id,
      kind: "WEB_PAGE" as const,
      url: o.url,
      title: o.title,
      domain: o.domain,
      via: "firecrawl",
      valueInr: o.amountInr,
      unit: o.unit,
      quote: o.quote.slice(0, 500),
      retrievedAt: new Date(),
    })),
  });
  return benchmark.id;
}

export async function estimateStep(ref: RunRef, route: Route | null, publish: Publish): Promise<TaxiEstimate | null> {
  const perTrip = unitFor({ service: "TAXI", vehicle: ref.input.vehicle, distanceKm: route?.distanceKm ?? null }) === "PER_TRIP";
  if (ref.input.service !== "TAXI" || !route || !perTrip) {
    await mark(ref, publish, "estimate", "SKIPPED");
    return null;
  }
  const t = Date.now();
  await mark(ref, publish, "estimate", "RUNNING");
  const est = estimateTaxiRange(route.distanceKm, ref.input.vehicle, await loadCuratedBenchmarks());
  if (!est) {
    await mark(ref, publish, "estimate", "SKIPPED");
    return null;
  }
  const message = `Estimated Rs ${est.lowInr}–${est.highInr} from ${route.distanceKm} km`;
  await event(ref, "estimate_used", message, "estimate");
  await mark(ref, publish, "estimate", "COMPLETED", { startedAt: t, message, output: est as unknown as Prisma.InputJsonValue });
  return est;
}

export async function skipStep(ref: RunRef, publish: Publish, step: PriceStepKey) {
  await mark(ref, publish, step, "SKIPPED");
}

// ───────────────────────── Comparing and saving ─────────────────────────

export type CompareInput = {
  places: PlacesState;
  route: Route | null;
  tariff: TariffState;
  /** Researched range, when research succeeded. */
  researched?: { lowInr: number; highInr: number; unit: string; benchmarkId: string; sampleSize: number } | null;
  /** Distance estimate, when no published fare was found. */
  estimate?: TaxiEstimate | null;
  /** How many pages research read when it did not succeed, for the explanation. */
  researchPagesRead?: number;
};

function explain(ref: RunRef, c: CompareInput, basis: Basis | null, communityReports: number) {
  const n = names(ref, c.places);
  const what =
    ref.input.service === "TAXI"
      ? `${n.origin} to ${n.destination}${vehicleLabel(ref.input.vehicle) ? ` ${vehicleLabel(ref.input.vehicle)}` : ""} trips`
      : `${SERVICE_LABELS[ref.input.service].toLowerCase()} prices in ${n.location}${ref.input.qualifier ? ` (${ref.input.qualifier.toLowerCase()})` : ""}`;
  const reports =
    communityReports > 0
      ? ` There ${communityReports === 1 ? "is" : "are"} also ${communityReports} community price report${communityReports === 1 ? "" : "s"} nearby in the last ${COMMUNITY_WINDOW_DAYS} days.`
      : "";

  if (basis === "curated") {
    const source = (c.tariff.details?.sourceLabel ?? "tariff").toLowerCase();
    const reversed = c.tariff.reversed ? " The tariff is written for the opposite direction; fares are the same both ways." : "";
    return `Based on the ${source} sheet for ${what}.${reversed}${reports}`;
  }
  if (basis === "researched") {
    const count = c.researched?.sampleSize ?? c.tariff.sampleSize ?? 0;
    return `Based on ${count} prices published online for ${what}, each checked against its page. Researched ranges are saved for ${RESEARCH_TTL_DAYS} days and reviewed by moderators.${reports}`;
  }
  if (basis === "estimated" && c.estimate) {
    return `No published fare was found, so this is an estimate: Rs ${Math.round(c.estimate.perKmLow)} to Rs ${Math.round(c.estimate.perKmHigh)} per km, fitted from ${c.estimate.basedOn} curated tariffs, over ${c.route?.distanceKm} km of road. Ask to see the posted fare board.${reports}`;
  }
  const looked = c.researchPagesRead ? ` We read ${c.researchPagesRead} public pages but found too few matching prices.` : "";
  if (c.tariff.reason === "ambiguous") {
    return `More than one tariff could apply. Choose a vehicle, room type, duration or package to compare.${looked}`;
  }
  return `We have no tariff on file for this, and could not find enough published prices to build a range.${looked} Ask to see the posted fare board or compare with another operator.`;
}

/** Classify the quote and write the PriceCheck row. */
export async function compareStep(ref: RunRef, c: CompareInput, publish: Publish): Promise<{ band: PriceBand; basis: Basis | null }> {
  const t = Date.now();
  await mark(ref, publish, "compare", "RUNNING");
  const { tariff } = c;

  let band: PriceBand = "NO_REFERENCE";
  let lowInr: number | null = null;
  let highInr: number | null = null;
  let percentOverHigh = 0;
  let source: Basis | null = null;
  if (c.researched) {
    ({ band, percentOverHigh } = classifyQuote(ref.input.quotedInr, c.researched.lowInr, c.researched.highInr));
    lowInr = c.researched.lowInr;
    highInr = c.researched.highInr;
    source = "researched";
  } else if (tariff.band !== "NO_REFERENCE") {
    ({ band, lowInr, highInr, percentOverHigh } = tariff);
    source = tariff.basis ?? "curated";
  } else if (c.estimate) {
    ({ band, percentOverHigh } = classifyQuote(ref.input.quotedInr, c.estimate.lowInr, c.estimate.highInr));
    lowInr = c.estimate.lowInr;
    highInr = c.estimate.highInr;
    source = "estimated";
  }
  const basis = band === "NO_REFERENCE" ? null : source;
  const confidence: Level | null =
    basis === "curated" ? (tariff.confidence ?? "HIGH") : basis === "researched" ? "MEDIUM" : basis === "estimated" ? "LOW" : null;

  const reportDistricts = [c.places.origin?.districtId, c.places.destination?.districtId, c.places.location?.districtId].filter((x): x is string => !!x);
  const communityReports = reportDistricts.length
    ? await prisma.report.count({
        where: {
          kind: "FARE_DISPUTE",
          category: ref.input.service,
          visibility: "PUBLIC",
          deletedAt: null,
          districtId: { in: reportDistricts },
          createdAt: { gte: new Date(Date.now() - COMMUNITY_WINDOW_DAYS * 86_400_000) },
        },
      })
    : 0;

  const n = names(ref, c.places);
  const taxi = ref.input.service === "TAXI";
  const distanceKm = c.route?.distanceKm ?? tariff.details?.distanceKm ?? null;
  const durationMin = c.route?.durationMin ?? tariff.details?.durationMin ?? null;
  const benchmarkId = c.researched?.benchmarkId ?? (basis === "curated" || basis === "researched" ? tariff.benchmarkId : null) ?? null;
  const reversed = basis === "curated" || basis === "researched" ? tariff.reversed : false;

  const data = {
    investigationId: ref.investigationId,
    serviceType: ref.input.service,
    originText: (taxi ? n.origin : n.location) ?? "",
    destinationText: taxi ? (n.destination ?? null) : null,
    originPlaceId: (taxi ? c.places.origin?.id : c.places.location?.id) || null,
    destinationPlaceId: c.places.destination?.id || null,
    districtId: (c.places.destination?.districtId ?? c.places.location?.districtId) || null,
    vehicle: ref.input.vehicle?.toUpperCase() ?? null,
    qualifier: ref.input.qualifier ?? null,
    quotedInr: ref.input.quotedInr,
    band,
    lowInr,
    highInr,
    percentOverHigh,
    benchmarkId,
    benchmarkLabel: basis === "estimated" ? "Estimate from distance" : basis === "researched" ? "Researched prices" : (tariff.details?.sourceLabel ?? null),
    distanceKm,
    durationMin,
    distanceIsApprox: c.route?.approx ?? false,
    routeVia: basis === "curated" ? (tariff.details?.via ?? null) : null,
    routeGeometry: c.route?.geometry ?? Prisma.JsonNull,
    communityReports,
    communityWindowDays: COMMUNITY_WINDOW_DAYS,
    explanation: explain(ref, c, basis, communityReports),
    basis,
    confidence,
    sampleSize: c.researched?.sampleSize ?? (basis === "researched" ? tariff.sampleSize : null) ?? null,
    reversed,
  };
  // Upsert: a retried step must not fail on the unique investigationId.
  await prisma.priceCheck.upsert({ where: { investigationId: ref.investigationId }, create: data, update: data });

  const message = band === "NO_REFERENCE" ? "No range to compare with" : `Quote is ${band.toLowerCase().replace(/_/g, " ")}`;
  await event(ref, "analysis_completed", message, "compare");
  await mark(ref, publish, "compare", "COMPLETED", { startedAt: t, message, output: { band, basis } });
  return { band, basis };
}

/** Close the run. Called once, after everything else succeeded. */
export async function completeRun(ref: RunRef) {
  const now = new Date();
  const durationMs = now.getTime() - ref.started;
  await Promise.all([
    prisma.workflowRun.update({ where: { id: ref.runId }, data: { status: "COMPLETED", finishedAt: now, durationMs, stepsDone: STEPS.length } }),
    prisma.investigation.update({ where: { id: ref.investigationId }, data: { status: "COMPLETED", completedAt: now, durationMs, currentStep: STEPS.length } }),
  ]);
}

/** Called by the workflow's failure handler after retries ran out. */
export async function failRun(investigationId: string, message: string) {
  const now = new Date();
  const run = await prisma.workflowRun.findFirst({ where: { investigationId }, orderBy: { createdAt: "desc" } });
  await Promise.all([
    run
      ? prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message.slice(0, 500), finishedAt: now } })
      : Promise.resolve(),
    prisma.investigation.update({ where: { id: investigationId }, data: { status: "FAILED", error: message.slice(0, 500) } }),
    run ? prisma.runEvent.create({ data: { runId: run.id, type: "run_failed", message: "The check could not finish" } }) : Promise.resolve(),
  ]);
}
