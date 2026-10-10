import prisma from "../src/lib/prisma";

async function main() {
  const [districts, places, props, verified, tariffs, boards, reports, events, findings, sims, idents, plans, help, sources, adv] = await Promise.all([
    prisma.district.count(), prisma.place.count(), prisma.property.count(), prisma.property.count({ where: { verified: true } }),
    prisma.tariffBenchmark.count(), prisma.tariffBoard.count(), prisma.report.count(), prisma.reportEvent.count(),
    prisma.officialFinding.count(), prisma.reportSimilarity.count(), prisma.identifier.count(), prisma.plan.count(),
    prisma.helpArticle.count(), prisma.knowledgeSource.count(), prisma.advisory.count(),
  ]);
  console.log({ districts, places, props, verified, tariffs, boards, reports, events, findings, sims, idents, plans, help, sources, adv });
  const byStatus = await prisma.report.groupBy({ by: ["status"], _count: true });
  console.log("reports by status:", Object.fromEntries(byStatus.map((s) => [s.status, s._count])));
  const byType = await prisma.property.groupBy({ by: ["type"], _count: true });
  console.log("properties by type:", Object.fromEntries(byType.map((s) => [s.type, s._count])));
  const demohills = await prisma.property.findFirst({ where: { domain: { contains: "demohills" } } });
  console.log("scam domain in directory (must be null):", demohills);
  const sample = await prisma.property.findFirst({ where: { domain: "sampleridge-stay.example" }, select: { name: true, verified: true } });
  console.log("sampleridge in directory:", sample);
  const route = await prisma.tariffBenchmark.findFirst({ where: { routeKey: "guwahati-airport|shillong-police-bazar|sedan" }, select: { lowInr: true, highInr: true } });
  console.log("airport->shillong sedan:", route);
  const noRef = await prisma.tariffBenchmark.count({ where: { routeKey: { contains: "jorhat-airport|majuli" } } });
  console.log("jorhat->majuli benchmarks (must be 0):", noRef);
  const r = await prisma.report.findUnique({ where: { reference: "TTD-7K2M9Q" }, include: { events: { orderBy: { createdAt: "asc" } }, findings: true, similar: true, identifiers: true } });
  console.log("TTD-7K2M9Q:", r?.status, r?.events.map((e) => e.type + (e.toStatus ? `>${e.toStatus}` : "")).join(", "), "| findings", r?.findings.length, "| similar", r?.similar.length, "| identifiers", r?.identifiers.length);
}
main().finally(() => prisma.$disconnect());
