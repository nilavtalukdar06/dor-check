import prisma from "../../src/lib/prisma";
import { routeKey } from "../../src/lib/route-key";
import {
  advisories,
  emergencyContacts,
  helpArticles,
  knowledgeSources,
  plans,
  properties,
  tariffBoards,
  tariffs,
} from "./catalog";
import { districts, places } from "./geo";
import { findings, reports } from "./reports";

const at = (iso: string) => new Date(iso);
const log = (msg: string) => console.log(`  ${msg}`);

/** Remove everything the seed created (rows flagged isDemo) so a reseed starts clean. */
export async function resetDemo() {
  await prisma.report.deleteMany({ where: { isDemo: true } });
  await prisma.property.deleteMany({ where: { isDemo: true } });
  await prisma.tariffBenchmark.deleteMany({ where: { isDemo: true } });
  await prisma.tariffBoard.deleteMany({ where: { isDemo: true } });
  await prisma.advisory.deleteMany({ where: { isDemo: true } });
  await prisma.knowledgeSource.deleteMany({ where: { isDemo: true } });
  await prisma.identifier.deleteMany({
    where: { properties: { none: {} }, reports: { none: {} }, investigations: { none: {} } },
  });
}

export async function seed() {
  // Districts and places: stable reference data, safe to run repeatedly.
  await prisma.district.createMany({
    data: districts.map((d) => ({ ...d, aliases: [...d.aliases] })),
    skipDuplicates: true,
  });
  const districtId = new Map(
    (await prisma.district.findMany({ select: { id: true, slug: true } })).map((d) => [d.slug, d.id]),
  );
  const dId = (slug: string) => {
    const id = districtId.get(slug);
    if (!id) throw new Error(`Unknown district ${slug}`);
    return id;
  };
  log(`${districts.length} districts`);

  await prisma.place.createMany({
    data: places.map(({ district, aliases, ...p }) => ({
      ...p,
      aliases: aliases ?? [],
      districtId: dId(district),
      isDemo: true,
    })),
    skipDuplicates: true,
  });
  const placeId = new Map(
    (await prisma.place.findMany({ select: { id: true, slug: true } })).map((p) => [p.slug, p.id]),
  );
  const pId = (slug: string) => {
    const id = placeId.get(slug);
    if (!id) throw new Error(`Unknown place ${slug}`);
    return id;
  };
  log(`${places.length} places`);

  // Plans, emergency contacts, help.
  for (const plan of plans) {
    await prisma.plan.upsert({ where: { tier: plan.tier }, create: plan, update: plan });
  }
  await prisma.emergencyContact.deleteMany();
  await prisma.emergencyContact.createMany({ data: emergencyContacts });
  await prisma.helpArticle.createMany({
    data: helpArticles.map((h) => ({ ...h, publishedAt: new Date() })),
    skipDuplicates: true,
  });
  log(`${plans.length} plans, ${emergencyContacts.length} emergency contacts, ${helpArticles.length} help articles`);

  await prisma.appSetting.upsert({
    where: { key: "demo_banner" },
    create: { key: "demo_banner", value: { enabled: true, text: "Demo build. All records are synthetic examples." } },
    update: {},
  });

  // Knowledge sources and advisories.
  await prisma.knowledgeSource.createMany({
    data: knowledgeSources.map((k, i) => ({
      id: `seed-source-${i}`,
      ...k,
      lastSyncedAt: k.lastSyncedAt ? at(k.lastSyncedAt) : null,
      isDemo: true,
    })),
    skipDuplicates: true,
  });
  await prisma.advisory.createMany({
    data: advisories.map(({ district, publishedAt, ...a }, i) => ({
      id: `seed-advisory-${i}`,
      ...a,
      districtId: district ? dId(district) : null,
      publishedAt: at(publishedAt),
      isDemo: true,
    })),
    skipDuplicates: true,
  });
  log(`${knowledgeSources.length} knowledge sources, ${advisories.length} advisories`);

  // Tariff boards and benchmarks.
  const boardId = new Map<string, string>(tariffBoards.map((b) => [b.key, `seed-board-${b.key}`]));
  await prisma.tariffBoard.createMany({
    data: tariffBoards.map((b) => ({
      id: boardId.get(b.key)!,
      name: b.name,
      notes: b.notes,
      lat: b.lat,
      lng: b.lng,
      districtId: dId(b.district),
      placeId: pId(b.place),
      lastVerifiedAt: at("2026-10-07T09:00:00+05:30"),
      isDemo: true,
    })),
    skipDuplicates: true,
  });

  const placeName = new Map(places.map((p) => [p.slug, p.name]));
  const districtName = new Map<string, string>(districts.map((d) => [d.slug, d.name]));
  await prisma.tariffBenchmark.createMany({
    data: tariffs.map((t) => {
      const key =
        t.service === "TAXI"
          ? routeKey(placeName.get(t.origin!), placeName.get(t.destination!), t.vehicle)
          : routeKey(districtName.get(t.district!), t.qualifier);
      return {
        serviceType: t.service,
        routeKey: key,
        originPlaceId: t.origin ? pId(t.origin) : null,
        destinationPlaceId: t.destination ? pId(t.destination) : null,
        districtId: t.district ? dId(t.district) : null,
        vehicle: t.vehicle ?? null,
        qualifier: t.qualifier ?? null,
        unit: t.unit ?? "PER_TRIP",
        lowInr: t.low,
        highInr: t.high,
        distanceKm: t.km ?? null,
        durationMin: t.min ?? null,
        via: t.via ?? null,
        nightSurchargePct: t.night ?? null,
        boardId: t.board ? boardId.get(t.board) : null,
        sourceLabel: "Demo tariff",
        effectiveOn: at("2026-10-07T00:00:00Z"),
        isDemo: true,
      };
    }),
    skipDuplicates: true,
  });
  log(`${tariffBoards.length} tariff boards, ${tariffs.length} tariff rows`);

  // Directory.
  await prisma.property.createMany({
    data: properties.map((p, i) => ({
      slug: p.slug,
      name: p.name,
      type: p.type,
      districtId: dId(p.district),
      description: `Demo ${p.type.toLowerCase()} listing in ${districtName.get(p.district)}.`,
      address: `${p.name}, ${districtName.get(p.district)}`,
      domain: p.domain ?? null,
      websiteUrl: p.domain ? `https://${p.domain}` : null,
      phone: `+91 98000 ${String(1000 + i)}`, // fake number
      businessUpi: p.verified ? `${p.slug.replace(/-/g, ".")}@demobank` : null,
      registrationNumber: p.verified ? `DEMO-${String(1000 + i)}` : null,
      lat: p.lat,
      lng: p.lng,
      tags: p.tags ?? [],
      verified: p.verified,
      verifiedAt: p.verified ? at("2026-09-15T10:00:00+05:30") : null,
      isDemo: true,
    })),
    skipDuplicates: true,
  });
  const propertyId = new Map(
    (await prisma.property.findMany({ select: { id: true, slug: true } })).map((p) => [p.slug, p.id]),
  );

  // Business identifiers so the same domain / UPI is recognised in investigations and reports.
  const propIdentifiers = properties.flatMap((p, i) => {
    const out: { slug: string; kind: "DOMAIN" | "PHONE" | "UPI"; value: string; display: string }[] = [];
    if (p.domain) out.push({ slug: p.slug, kind: "DOMAIN", value: p.domain, display: p.domain });
    const phone = `+91 98000 ${String(1000 + i)}`;
    out.push({ slug: p.slug, kind: "PHONE", value: phone.replace(/\D/g, ""), display: phone });
    if (p.verified) {
      const upi = `${p.slug.replace(/-/g, ".")}@demobank`;
      out.push({ slug: p.slug, kind: "UPI", value: upi, display: upi });
    }
    return out;
  });
  await prisma.identifier.createMany({
    data: propIdentifiers.map(({ kind, value, display }) => ({ kind, value, display, isBusiness: true })),
    skipDuplicates: true,
  });
  const identifiers = await prisma.identifier.findMany({ select: { id: true, kind: true, value: true } });
  const identId = new Map(identifiers.map((x) => [`${x.kind}:${x.value}`, x.id]));
  await prisma.propertyIdentifier.createMany({
    data: propIdentifiers.map((x) => ({
      propertyId: propertyId.get(x.slug)!,
      identifierId: identId.get(`${x.kind}:${x.value}`)!,
    })),
    skipDuplicates: true,
  });
  log(`${properties.length} properties, ${propIdentifiers.length} business identifiers`);

  // Community reports, written in bulk (one round trip per table, not per report).
  const reportId = (ref: string) => `seed-report-${ref}`;
  const existing = new Set((await prisma.report.findMany({ select: { reference: true } })).map((r) => r.reference));
  const fresh = reports.filter((r) => !existing.has(r.reference));

  const reportRows = fresh.map((r) => {
    const submitted = at(r.submittedAt);
    const terminal = ["RESOLVED", "CLOSED", "REJECTED"].includes(r.status);
    return {
      id: reportId(r.reference),
      reference: r.reference,
      kind: r.kind,
      category: r.category,
      summary: r.summary,
      description: r.description,
      districtId: dId(r.district),
      locationText: r.place ?? null,
      lat: r.lat,
      lng: r.lng,
      incidentAt: at(r.incidentAt),
      status: r.status,
      priority: r.priority,
      amountInr: r.amountInr ?? null,
      reportedUrl: r.reportedUrl ?? null,
      propertyId: r.property ? propertyId.get(r.property) : null,
      isAnonymous: true,
      autoCheckedAt: new Date(submitted.getTime() + 60_000),
      autoCheckMatches: r.matches,
      autoCheckSummary: `Auto: ${r.matches} match${r.matches === 1 ? "" : "es"}`,
      firstReviewedAt: r.reviewAt ? at(r.reviewAt) : null,
      resolvedAt: terminal && r.closedAt ? at(r.closedAt) : null,
      streamChannelId: `report-${r.reference}`,
      isDemo: true,
      createdAt: submitted,
    };
  });
  await prisma.report.createMany({ data: reportRows, skipDuplicates: true });

  const eventRows = fresh.flatMap((r) => {
    const submitted = at(r.submittedAt);
    const rows: {
      reportId: string;
      type: "SUBMITTED" | "AUTO_CHECKED" | "STATUS_CHANGED" | "FINDING_PUBLISHED";
      fromStatus?: typeof r.status;
      toStatus?: typeof r.status;
      note?: string;
      createdAt: Date;
    }[] = [
      { reportId: reportId(r.reference), type: "SUBMITTED", toStatus: "NEW", createdAt: submitted },
      {
        reportId: reportId(r.reference),
        type: "AUTO_CHECKED",
        note: `Matches ${r.matches} report${r.matches === 1 ? "" : "s"}`,
        createdAt: new Date(submitted.getTime() + 60_000),
      },
    ];
    if (r.reviewAt) {
      rows.push({ reportId: reportId(r.reference), type: "STATUS_CHANGED", fromStatus: "NEW", toStatus: "UNDER_REVIEW", createdAt: at(r.reviewAt) });
    }
    const finding = findings.find((f) => f.reference === r.reference);
    if (finding) {
      rows.push({ reportId: reportId(r.reference), type: "FINDING_PUBLISHED", createdAt: at(finding.publishedAt) });
    }
    if (r.closedAt && r.status !== "NEW" && r.status !== "UNDER_REVIEW") {
      rows.push({ reportId: reportId(r.reference), type: "STATUS_CHANGED", fromStatus: "UNDER_REVIEW", toStatus: r.status, createdAt: at(r.closedAt) });
    }
    return rows;
  });
  await prisma.reportEvent.createMany({ data: eventRows });

  await prisma.officialFinding.createMany({
    data: findings
      .filter((f) => fresh.some((r) => r.reference === f.reference))
      .map((f) => ({ reportId: reportId(f.reference), body: f.body, publishedAt: at(f.publishedAt) })),
  });

  // Identifiers the reports mention (reported URL and domain, seller UPI). Private people, not businesses.
  const reportIdents = fresh.flatMap((r) => {
    const rows: { reference: string; kind: "URL" | "UPI" | "DOMAIN"; value: string; display: string; role: string }[] = [];
    if (r.reportedUrl) {
      const host = new URL(r.reportedUrl).hostname;
      rows.push({ reference: r.reference, kind: "URL", value: r.reportedUrl.toLowerCase(), display: r.reportedUrl, role: "reported_url" });
      rows.push({ reference: r.reference, kind: "DOMAIN", value: host, display: host, role: "reported_url" });
    }
    if (r.upi) rows.push({ reference: r.reference, kind: "UPI", value: r.upi.toLowerCase(), display: r.upi, role: "seller_upi" });
    return rows;
  });
  await prisma.identifier.createMany({
    data: reportIdents.map(({ kind, value, display }) => ({ kind, value, display, isBusiness: false })),
    skipDuplicates: true,
  });
  const allIdents = new Map(
    (await prisma.identifier.findMany({ select: { id: true, kind: true, value: true } })).map((x) => [`${x.kind}:${x.value}`, x.id]),
  );
  await prisma.reportIdentifier.createMany({
    data: reportIdents.map((x) => ({
      reportId: reportId(x.reference),
      identifierId: allIdents.get(`${x.kind}:${x.value}`)!,
      role: x.role,
    })),
    skipDuplicates: true,
  });
  const created = fresh.length;

  // Similar-report links (needs every report to exist first).
  const byRef = new Map(reports.map((r) => [r.reference, reportId(r.reference)]));
  const similar = reports.flatMap((r) =>
    (r.similarTo ?? []).map((s) => ({
      reportId: byRef.get(r.reference)!,
      similarReportId: byRef.get(s.reference)!,
      reason: s.reason,
      score: 1,
    })),
  );
  await prisma.reportSimilarity.createMany({ data: similar, skipDuplicates: true });
  log(`${created} new reports (${reports.length} in seed), ${findings.length} official findings`);
}
