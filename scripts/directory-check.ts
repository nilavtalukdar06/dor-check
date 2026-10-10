// Checks the directory queries against the seeded database.
import { directoryParamsSchema } from "../src/lib/directory";
import prisma from "../src/lib/prisma";
import { getPropertyDetail, listProperties } from "../src/server/directory-queries";

let fails = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  if (!ok) fails++;
};
const p = (o: Record<string, string>) => directoryParamsSchema.parse(o);

async function main() {
  const all = await listProperties(p({}));
  check("all: 36 properties", all.total === 36, all.total);
  check("verified places are listed first", all.items.slice(0, 19).every((i) => i.verified) && all.items.slice(19).every((i) => !i.verified), all.items.map((i) => i.verified).join(""));

  for (const [tab, count] of [["stays", 16], ["taxis", 8], ["guides", 6], ["tours", 6]] as const) {
    const r = await listProperties(p({ type: tab }));
    check(`tab ${tab}: ${count}`, r.total === count && r.items.every((i) => i.type === { stays: "STAY", taxis: "TAXI", guides: "GUIDE", tours: "TOUR" }[tab]), r.total);
  }
  const ver = await listProperties(p({ verified: "1" }));
  check("verified only: 19, all verified", ver.total === 19 && ver.items.every((i) => i.verified), ver.total);
  const both = await listProperties(p({ type: "stays", verified: "1" }));
  check("tab + verified combine", both.total > 0 && both.total < 16 && both.items.every((i) => i.verified && i.type === "STAY"), both.total);

  const byName = await listProperties(p({ q: "kaziranga" }));
  check("search by name (case-insensitive)", byName.total >= 3 && byName.items.every((i) => /kaziranga|golaghat/i.test(i.name + i.districtName)), byName.items.map((i) => i.name));
  const byDistrict = await listProperties(p({ q: "MAJULI" }));
  check("search by district", byDistrict.total >= 3 && byDistrict.items.every((i) => /majuli/i.test(i.name + i.districtName)), byDistrict.total);
  const byDomain = await listProperties(p({ q: "sampleridge-stay.example" }));
  check("search by domain", byDomain.total === 1 && byDomain.items[0].slug === "sampleridge-stay", byDomain.items);
  const none = await listProperties(p({ q: "zzzz-nothing" }));
  check("no match gives an empty list", none.total === 0 && none.items.length === 0);

  const d = await getPropertyDetail("sampleridge-stay");
  check("detail: business fields and no private data", !!d && d.verified && d.domain === "sampleridge-stay.example" && !!d.phone && !!d.businessUpi && !("reporterId" in (d as object)), d);
  const withReports = await prisma.property.findFirst({ where: { reports: { some: {} } }, select: { slug: true } });
  const dr = withReports ? await getPropertyDetail(withReports.slug) : null;
  check("detail: linked public reports come with summary and status only", !!dr && dr.reportCount >= 1 && dr.reports.every((r) => /^TTD-/.test(r.reference) && r.summary && r.status && !("description" in r)), dr?.reports);
  check("detail: unknown slug is null", (await getPropertyDetail("nope")) === null);

  // Inactive (soft-deleted) places disappear from the list and the drawer.
  await prisma.property.update({ where: { slug: "sampleridge-stay" }, data: { isActive: false } });
  const gone = await listProperties(p({ q: "sampleridge" }));
  const goneDetail = await getPropertyDetail("sampleridge-stay");
  await prisma.property.update({ where: { slug: "sampleridge-stay" }, data: { isActive: true } });
  check("deleted places are hidden", gone.total === 0 && goneDetail === null);

  console.log(fails ? `\n${fails} FAILED` : "\nAll directory query checks passed");
  process.exitCode = fails ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
