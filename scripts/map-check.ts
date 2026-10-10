// Checks the Explore map query against the seeded database.
import { mapQuerySchema, NE_BOUNDS } from "../src/lib/map";
import prisma from "../src/lib/prisma";
import { getMapSignals } from "../src/server/map";

let fails = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  if (!ok) fails++;
};
const q = (o: Record<string, string>) => mapQuerySchema.parse(o);
const bbox = NE_BOUNDS.join(",");

async function main() {
  const all = await getMapSignals(q({ bbox }));
  const by = (layer: string) => all.signals.filter((s) => s.layer === layer);
  check("all three layers appear across the region", by("reports").length > 0 && by("properties").length > 0 && by("tariffs").length > 0, all.total);
  check("15 seeded reports, 36 properties, 3 boards", by("reports").length === 15 && by("properties").length === 36 && by("tariffs").length === 3, [by("reports").length, by("properties").length, by("tariffs").length]);
  check("pin kinds: scam red, fare amber, verified green, listed grey, board blue",
    new Set(all.signals.map((s) => s.kind)).size === 5, [...new Set(all.signals.map((s) => s.kind))]);
  check("fare disputes are amber", by("reports").filter((s) => s.kind === "fare").length === 4, by("reports").filter((s) => s.kind === "fare").length);

  const only = await getMapSignals(q({ bbox, layers: "tariffs" }));
  check("layer filter: tariffs only", only.signals.length === 3 && only.signals.every((s) => s.layer === "tariffs"));

  const shillongBox = await getMapSignals(q({ bbox: "91.6,25.4,92.1,25.8" }));
  check("bbox filter: a Shillong-sized box returns fewer pins, all inside it",
    shillongBox.total > 0 && shillongBox.total < all.total && shillongBox.signals.every((s) => s.lng >= 91.6 && s.lng <= 92.1 && s.lat >= 25.4 && s.lat <= 25.8), shillongBox.total);

  const meg = await getMapSignals(q({ bbox, state: "ML" }));
  const asm = await getMapSignals(q({ bbox, state: "AS" }));
  check("state filter splits the region (Meghalaya + Assam = all)", meg.total > 0 && asm.total > 0 && meg.total + asm.total === all.total, [meg.total, asm.total, all.total]);

  const old = await getMapSignals(q({ bbox, layers: "reports", days: "1" }));
  check("last-N-days only trims reports", old.total < 15, old.total);
  const month = await getMapSignals(q({ bbox, layers: "reports", days: "30" }));
  check("30 days keeps the recent seeded reports", month.total > 0, month.total);

  const search = await getMapSignals(q({ q: "kaziranga" }));
  check("search finds Kaziranga places without a bbox", search.total > 0 && search.signals.every((s) => /kaziranga|golaghat/i.test(s.title + s.subtitle)), search.signals.map((s) => s.title));

  const hit = by("reports").find((s) => s.title.includes("advance payment"));
  check("report pin text is the summary + place + date, with a report link", !!hit && /^TTD-/.test(hit.href.split("/").pop() ?? "") && /\d+ \w{3}$/.test(hit.subtitle), hit);
  const json = JSON.stringify(all);
  check("no UPI ids, phone numbers or reporter fields leak", !/@okfakebank|@demobank|\+91|reporterId|"reporter"|"phone"|"businessUpi"|"upi"/i.test(json));

  // Hidden reports must not appear.
  const target = await prisma.report.findFirstOrThrow({ where: { isDemo: true, visibility: "PUBLIC" } });
  await prisma.report.update({ where: { id: target.id }, data: { visibility: "HIDDEN" } });
  const hidden = await getMapSignals(q({ bbox, layers: "reports" }));
  await prisma.report.update({ where: { id: target.id }, data: { visibility: "PUBLIC" } });
  check("hidden reports are not shown", hidden.total === 14 && !hidden.signals.some((s) => s.href.endsWith(target.reference)), hidden.total);

  console.log(fails ? `\n${fails} FAILED` : "\nAll map data checks passed");
  process.exitCode = fails ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
