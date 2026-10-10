// Live check of the Firecrawl research module (uses a few credits).
// Researches a seeded property, saves the sources, and checks that failures are never evidence.
import prisma from "../src/lib/prisma";
import { saveSources, scrapeUrl, searchWeb } from "../src/server/research";

let fails = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  if (!ok) fails++;
};

async function main() {
  const property = await prisma.property.findUniqueOrThrow({ where: { slug: "kaziranga-jungle-lodge" }, include: { district: true } });
  const query = `${property.name} ${property.district.name}`;
  console.log(`Researching "${query}"`);

  const hits = await searchWeb(query, { limit: 5 });
  check("search returns at least 3 hits", hits.length >= 3, hits.length);
  check("every hit has a URL, title and retrieval time", hits.every((h) => /^https?:\/\//.test(h.url) && h.title && !Number.isNaN(Date.parse(h.retrievedAt))), hits.slice(0, 2));
  check("no denied sites (social login walls) in the results", hits.every((h) => !/facebook|instagram|twitter|youtube|linkedin/.test(h.domain)), hits.map((h) => h.domain));

  const withText = await searchWeb(query, { limit: 3, includeText: true }).catch((err) => {
    console.log("  (text search failed:", String(err).slice(0, 80) + ")");
    return [];
  });
  const texts = withText.filter((h) => h.text);
  check("with text: pages come back trimmed to the token budget", texts.length > 0 && texts.every((h) => h.text!.length <= 1500 * 4 + 1), texts.map((h) => h.text!.length));

  const page = await scrapeUrl(hits[0].url);
  check("scraping a hit returns text, status and time", page.ok && page.text.length > 100, page);

  const dead = await scrapeUrl("https://this-domain-does-not-exist-ttd.invalid/page");
  check("an unreachable page is 'unavailable', not an error", !dead.ok && dead.reason === "unavailable", dead);
  const blocked = await scrapeUrl("http://169.254.169.254/latest/meta-data");
  check("a private address is blocked before any request", !blocked.ok && blocked.reason === "blocked", blocked);
  const social = await scrapeUrl("https://www.facebook.com/somepage");
  check("a denied site is blocked", !social.ok && social.reason === "blocked", social);

  const saved = await saveSources([...hits.slice(0, 3), dead]);
  check("sources saved with URL, domain and retrieval time", saved.length === 4 && saved.every((s) => s.url && s.domain && s.retrievedAt), saved.length);
  check("the unreachable page is stored as unavailable with no excerpt", saved[3].unavailable === true && saved[3].excerpt === null && saved[3].contentHash === null, saved[3]);
  check("three real sources are stored as usable", saved.slice(0, 3).every((s) => !s.unavailable), saved.slice(0, 3).map((s) => s.unavailable));

  console.log("\nSources for", property.name);
  for (const s of saved) console.log(`  ${s.retrievedAt.toISOString()}  ${s.unavailable ? "[unavailable] " : ""}${s.url}`);

  await prisma.source.deleteMany({ where: { id: { in: saved.map((s) => s.id) } } });
  console.log(fails ? `\n${fails} FAILED` : "\nAll research checks passed");
  process.exitCode = fails ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
