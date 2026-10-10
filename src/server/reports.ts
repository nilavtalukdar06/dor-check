import { Prisma } from "@/generated/prisma/client";
import { inngest } from "@/inngest/client";
import { reportSubmitted, sourceSyncRequested } from "@/inngest/events";
import { extractIdentifiers, normalizeDomain } from "@/lib/identifiers";
import { maskPhone, maskUpi } from "@/lib/investigation";
import prisma from "@/lib/prisma";
import { canTransition, generateReference, STATUS_LABEL, type ReportData, type ReportStatusName } from "@/lib/reports";
import { directoryData } from "@/server/agent-data";
import { resolvePlace, type PickedGeo } from "@/server/geocoding";
import { pineconeConfigured } from "@/server/pinecone";
import { consumeRateLimit } from "@/server/rate-limit";
import { retrieve } from "@/server/retrieve";

// Reports as records: creating one, checking it against the others, moving it through review,
// and telling the people who follow it. Pages and actions call these; the Inngest function
// `report-submitted` runs the auto-check.

const REPORTS_PER_HOUR = 5;
/** The knowledge source that holds past community reports (see lib/knowledge INTERNAL_SOURCES). */
const REPORTS_SOURCE_ID = "internal-reports";

export type CreateResult = { ok: true; id: string; reference: string } | { ok: false; error: string };

// ───────────────────────── Creating ─────────────────────────

/** The identifiers a report mentions, so the same seller can be recognised in later checks. */
async function identifiersFor(data: ReportData) {
  const found = extractIdentifiers(`${data.reportedUrl ?? ""}\n${data.summary}\n${data.description}`);
  const wanted: { kind: "URL" | "DOMAIN" | "PHONE" | "UPI"; value: string; display: string; role: string }[] = [
    ...(data.reportedUrl ? [{ kind: "URL" as const, value: data.reportedUrl.toLowerCase(), display: data.reportedUrl, role: "reported_url" }] : []),
    ...found.domains.slice(0, 3).map((d) => ({ kind: "DOMAIN" as const, value: d, display: d, role: "reported_url" })),
    ...found.phones.slice(0, 2).map((p) => ({ kind: "PHONE" as const, value: p, display: maskPhone(p), role: "seller_phone" })),
    ...found.upis.slice(0, 2).map((u) => ({ kind: "UPI" as const, value: u, display: maskUpi(u), role: "seller_upi" })),
  ];
  const rows: { identifierId: string; role: string }[] = [];
  for (const w of wanted) {
    const row = await prisma.identifier.upsert({ where: { kind_value: { kind: w.kind, value: w.value } }, create: { kind: w.kind, value: w.value, display: w.display, isBusiness: false }, update: {}, select: { id: true } });
    if (!rows.some((r) => r.identifierId === row.id)) rows.push({ identifierId: row.id, role: w.role });
  }
  return rows;
}

/**
 * Save a traveller's report. The reporter is stored, and hidden publicly unless they chose to be
 * shown. Everything that needs judgement (duplicates, similar reports, moderator alerts) happens
 * afterwards, in the `report-submitted` workflow.
 */
export async function createReport(user: { id: string }, data: ReportData): Promise<CreateResult> {
  if (!(await consumeRateLimit(`report:${user.id}`, REPORTS_PER_HOUR, 3600))) {
    return { ok: false, error: "You have sent several reports this hour. Please try again later." };
  }

  const district = await prisma.district.findUnique({ where: { id: data.districtId }, select: { id: true, name: true } });
  if (!district) return { ok: false, error: "Choose a district from the list." };

  // Attachments must be the reporter's own.
  const evidenceIds = [...new Set(data.evidenceIds)];
  if (evidenceIds.length) {
    const owned = await prisma.evidence.count({ where: { id: { in: evidenceIds }, ownerId: user.id, deletedAt: null } });
    if (owned !== evidenceIds.length) return { ok: false, error: "One of the attachments is not yours or no longer exists." };
  }
  let investigation: { id: string; matchedPropertyId: string | null } | null = null;
  if (data.investigationId) {
    investigation = await prisma.investigation.findFirst({ where: { id: data.investigationId, userId: user.id, deletedAt: null }, select: { id: true, matchedPropertyId: true } });
  }

  // Where it happened. A place found on the map puts the report on the Explore map; without one it is only listed.
  let lat: number | null = null;
  let lng: number | null = null;
  if (data.locationText) {
    try {
      const place = await resolvePlace(`${data.locationText}`, data.placeId, data.geo as PickedGeo | undefined);
      if (place) ({ lat, lng } = place);
    } catch {
      // The report matters more than its pin.
    }
  }

  // A report about a website that belongs to a listed business is linked to that business.
  let propertyId = investigation?.matchedPropertyId ?? null;
  if (!propertyId && data.reportedUrl) {
    const match = (await directoryData.findByIdentifiers({ domains: [normalizeDomain(data.reportedUrl)], phones: [], upis: [] })).find((m) => m.matchedOn.includes("domain"));
    propertyId = match?.propertyId ?? null;
  }

  const identifiers = await identifiersFor(data);

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateReference();
    try {
      const report = await prisma.report.create({
        data: {
          reference,
          reporterId: user.id,
          isAnonymous: data.isAnonymous,
          kind: data.kind,
          category: data.category,
          summary: data.summary,
          description: data.description,
          districtId: district.id,
          locationText: data.locationText ?? null,
          lat,
          lng,
          incidentAt: data.incidentDate ? new Date(`${data.incidentDate}T00:00:00Z`) : null,
          propertyId,
          investigationId: investigation?.id ?? null,
          reportedUrl: data.reportedUrl ?? null,
          amountInr: data.amountInr ?? null,
          streamChannelId: `report-${reference}`,
          events: { create: { type: "SUBMITTED", actorId: user.id, toStatus: "NEW", note: "Report submitted" } },
          // The reporter follows their own report from the start.
          followers: { create: { userId: user.id } },
          evidence: { create: evidenceIds.map((evidenceId) => ({ evidenceId })) },
          identifiers: { create: identifiers },
        },
        select: { id: true },
      });
      try {
        await inngest.send(reportSubmitted.create({ reportId: report.id, reference }, { id: `report-${report.id}` }));
      } catch {
        // Saved is saved: the check can be run again, and the report already shows in the list.
        console.warn("report: could not queue the auto-check", reference);
      }
      return { ok: true, id: report.id, reference };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // reference collision: try another
      throw err;
    }
  }
  return { ok: false, error: "We could not create a reference for your report. Please try again." };
}

// ───────────────────────── Auto-check ─────────────────────────

const SAME: Record<string, string> = { DOMAIN: "same_domain", URL: "same_url", UPI: "same_upi", PHONE: "same_phone" };
/** When another report matches in several ways, the strongest sign is the one shown: a payment id says more than a website. */
const STRENGTH: Record<string, number> = { same_upi: 0, same_phone: 1, same_url: 2, same_domain: 3, similar_text: 4 };

export type AutoCheckResult = { matches: number; exact: number; similar: number; summary: string };

/**
 * Compare a new report with the others: the same web address, UPI id or phone number in another
 * public report, and reports that read alike (Pinecone). Safe to run again: the matches are rewritten
 * whole and the history line is only added once.
 */
export async function runAutoCheck(reportId: string): Promise<AutoCheckResult> {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: { identifiers: { select: { identifierId: true, identifier: { select: { kind: true } } } } },
  });

  // 1. The same identifier in another report people can see.
  const others = report.identifiers.length
    ? await prisma.reportIdentifier.findMany({
        where: { identifierId: { in: report.identifiers.map((i) => i.identifierId) }, reportId: { not: report.id }, report: { deletedAt: null, visibility: "PUBLIC", status: { not: "REJECTED" } } },
        select: { reportId: true, identifier: { select: { kind: true } } },
      })
    : [];
  const matches = new Map<string, { reason: string; score: number | null }>();
  for (const o of others) {
    const reason = SAME[o.identifier.kind] ?? "same_domain";
    const known = matches.get(o.reportId);
    if (!known || STRENGTH[reason] < STRENGTH[known.reason]) matches.set(o.reportId, { reason, score: null });
  }
  const exact = matches.size;

  // 2. Reports that read alike. A search that cannot run only means fewer matches.
  if (pineconeConfigured()) {
    try {
      const hits = await retrieve(`${report.summary}. ${report.description}`.slice(0, 400), { types: ["REPORT"], topK: 6, minScore: 0.55 });
      const docs = hits.length ? await prisma.knowledgeDocument.findMany({ where: { id: { in: hits.map((h) => h.documentId) }, reportId: { not: null } }, select: { id: true, reportId: true } }) : [];
      for (const h of hits) {
        const doc = docs.find((d) => d.id === h.documentId);
        if (doc?.reportId && doc.reportId !== report.id && !matches.has(doc.reportId)) matches.set(doc.reportId, { reason: "similar_text", score: Math.round(h.score * 100) / 100 });
      }
    } catch (err) {
      console.warn("report auto-check: similarity search failed", err instanceof Error ? err.message : err);
    }
  }

  // The result is rewritten whole, so running the check again gives the same answer, and a match that
  // no longer holds (say, the other report was rejected) disappears.
  await prisma.$transaction([
    prisma.reportSimilarity.deleteMany({ where: { reportId: report.id } }),
    prisma.reportSimilarity.createMany({ data: [...matches].map(([similarReportId, m]) => ({ reportId: report.id, similarReportId, reason: m.reason, score: m.score })) }),
  ]);

  const n = matches.size;
  const summary = n === 0 ? "Auto: no matches" : `Auto: matches ${n} ${n === 1 ? "report" : "reports"}`;
  await prisma.report.update({
    where: { id: report.id },
    // Reports that match others go to the front of the queue.
    data: { autoCheckedAt: new Date(), autoCheckSummary: summary, autoCheckMatches: n, ...(n >= 2 ? { priority: "HIGH" as const } : {}) },
  });
  if (!(await prisma.reportEvent.count({ where: { reportId: report.id, type: "AUTO_CHECKED" } }))) {
    await prisma.reportEvent.create({ data: { reportId: report.id, type: "AUTO_CHECKED", note: n === 0 ? "No similar reports" : `Matches ${n} ${n === 1 ? "report" : "reports"}`, data: { matches: n, exact, similar: n - exact } } });
  }
  return { matches: n, exact, similar: n - exact, summary };
}

/** Ask for the community-reports knowledge source to be re-read, so a new or changed report becomes searchable. */
export async function requestReportsReindex(requestedById?: string) {
  try {
    await inngest.send(sourceSyncRequested.create({ sourceId: REPORTS_SOURCE_ID, ...(requestedById ? { requestedById } : {}) }));
  } catch {
    console.warn("reports: could not queue the knowledge re-index");
  }
}

// ───────────────────────── Review ─────────────────────────

export type StatusResult = { ok: true; from: ReportStatusName; to: ReportStatusName } | { ok: false; error: string };

/**
 * Move a report through review. Only moderators and admins may. Every change is written to the
 * history, and the people following the report are told (the moderator who did it is not).
 */
export async function changeReportStatus(reportId: string, actor: { id: string; role: "TRAVELLER" | "MODERATOR" | "ADMIN" }, to: ReportStatusName, note?: string): Promise<StatusResult> {
  if (actor.role === "TRAVELLER") return { ok: false, error: "Only moderators can change a report's status." };
  const report = await prisma.report.findFirst({ where: { id: reportId, deletedAt: null }, select: { id: true, reference: true, status: true, firstReviewedAt: true } });
  if (!report) return { ok: false, error: "Not found." };
  const from = report.status as ReportStatusName;
  if (!canTransition(from, to)) return { ok: false, error: `A report that is ${STATUS_LABEL[from].toLowerCase()} cannot become ${STATUS_LABEL[to].toLowerCase()}.` };

  const now = new Date();
  // A compare-and-set, so two moderators acting at once cannot both apply the same step.
  const moved = await prisma.report.updateMany({
    where: { id: report.id, status: from },
    data: { status: to, ...(report.firstReviewedAt ? {} : { firstReviewedAt: now }), ...(to === "RESOLVED" || to === "CLOSED" || to === "REJECTED" ? { resolvedAt: now } : {}) },
  });
  if (moved.count === 0) return { ok: false, error: "Someone else just changed this report. Reload and try again." };

  await prisma.reportEvent.create({ data: { reportId: report.id, type: "STATUS_CHANGED", actorId: actor.id, fromStatus: from, toStatus: to, note: note?.trim().slice(0, 300) || null } });

  const followers = await prisma.reportFollow.findMany({ where: { reportId: report.id, userId: { not: actor.id } }, select: { userId: true } });
  if (followers.length) {
    await prisma.notification.createMany({
      data: followers.map((f) => ({ userId: f.userId, type: "report_status", title: `${report.reference} is now ${STATUS_LABEL[to].toLowerCase()}`, body: note?.trim().slice(0, 200) || null, href: `/reports/${report.reference}`, data: { reportId: report.id, from, to } })),
    });
  }
  // Rejected reports leave the knowledge base; verified ones carry their new status into it.
  await requestReportsReindex(actor.id);
  return { ok: true, from, to };
}

// ───────────────────────── Following ─────────────────────────

/** Follow or unfollow a report you can see. Returns whether you are now following. */
export async function toggleFollow(userId: string, reference: string): Promise<{ ok: true; following: boolean } | { ok: false; error: string }> {
  const report = await prisma.report.findFirst({
    where: { reference, deletedAt: null, OR: [{ visibility: "PUBLIC", status: { not: "REJECTED" } }, { reporterId: userId }] },
    select: { id: true },
  });
  if (!report) return { ok: false, error: "Not found." };
  const key = { reportId_userId: { reportId: report.id, userId } };
  const existing = await prisma.reportFollow.findUnique({ where: key });
  if (existing) {
    await prisma.reportFollow.delete({ where: key });
    return { ok: true, following: false };
  }
  await prisma.reportFollow.create({ data: { reportId: report.id, userId } });
  return { ok: true, following: true };
}
