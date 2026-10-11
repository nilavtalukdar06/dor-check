// Live check of the knowledge base: the real Pinecone index (llama-text-embed-v2) and the database.
// It edits a few demo rows to prove change and removal handling, and puts everything back.
import { Pinecone } from "@pinecone-database/pinecone";
import prismaModule from "../src/lib/prisma";
// An ES module importing a CommonJS default export gets it wrapped one level deeper.
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { EMBEDDING, KNOWLEDGE_TYPES, NAMESPACE } from "../src/lib/knowledge";
import { ensureInternalSources, syncSource } from "../src/server/knowledge";
import { namespaceCounts } from "../src/server/pinecone";
import { retrieve } from "../src/server/retrieve";

let fails = 0;
const check = (name: string, ok: unknown, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)?.slice(0, 500)}`);
  if (!ok) fails++;
};
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = (ns: string) => pc.index({ name: process.env.PINECONE_INDEX!, namespace: ns });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pinecone is eventually consistent: wait until `cond` holds. */
async function until<T>(read: () => Promise<T>, cond: (v: T) => boolean, ms = 40_000): Promise<T> {
  const t = Date.now();
  let v = await read();
  while (!cond(v) && Date.now() - t < ms) { await sleep(1500); v = await read(); }
  return v;
}
const dbChunks = async (sourceId: string) => prisma.vectorRecord.count({ where: { document: { sourceId } } });

async function main() {
  // ---- The index
  const desc = await pc.describeIndex(process.env.PINECONE_INDEX!);
  const field = (desc as unknown as { schema?: { fields?: Record<string, { type?: string; model?: string; dimension?: number }> } }).schema?.fields?.text;
  check("the index embeds the `text` field with llama-text-embed-v2 at 1024 dimensions", field?.type === "semantic_text" && field.model === EMBEDDING.model && field.dimension === EMBEDDING.dimension, field);

  // ---- Sources
  await ensureInternalSources();
  const sources = await prisma.knowledgeSource.findMany({ orderBy: { name: "asc" } });
  check("four built-in sources exist, all from our database, one per namespace; the invented demo ones are gone", sources.length >= 4 && KNOWLEDGE_TYPES.every((t) => sources.some((s) => s.id === `internal-${NAMESPACE[t]}` && s.via === "INTERNAL" && s.pineconeNamespace === NAMESPACE[t])) && !sources.some((s) => s.id.startsWith("seed-source-")), sources.map((s) => s.id));

  // ---- Sync, twice: the second run must change nothing
  const first = await Promise.all(KNOWLEDGE_TYPES.map((t) => syncSource(`internal-${NAMESPACE[t]}`)));
  const second = await Promise.all(KNOWLEDGE_TYPES.map((t) => syncSource(`internal-${NAMESPACE[t]}`)));
  check("a second sync indexes nothing and removes nothing (unchanged documents are skipped)", second.every((s) => s.changed === 0 && s.removed === 0) && second.every((s, i) => s.documents === first[i].documents), second);
  // Sources a moderator added (web pages) share the namespaces, so each namespace should hold
  // the built-in source's chunks plus theirs.
  const added = async (t: string) => prisma.vectorRecord.count({ where: { document: { source: { via: { not: "INTERNAL" }, type: t } } } });
  const expected = async () => Object.fromEntries(await Promise.all(KNOWLEDGE_TYPES.map(async (t, i) => [NAMESPACE[t], second[i].chunks + (await added(t))] as const)));
  const want = await expected();
  const counts = await until(namespaceCounts, (c) => KNOWLEDGE_TYPES.every((t) => c[NAMESPACE[t]] === want[NAMESPACE[t]]));
  check("Pinecone's record count per namespace equals our database's chunk count (no duplicates, no leftovers)", KNOWLEDGE_TYPES.every((t) => counts[NAMESPACE[t]] === want[NAMESPACE[t]]), { counts, want });
  check("each source's recorded size and status match what was indexed", (await prisma.knowledgeSource.findMany({ where: { via: "INTERNAL" } })).every((s) => s.status === "INDEXED" && s.recordCount > 0 && !!s.lastSyncedAt && s.lastSyncDurationMs !== null && s.error === null));

  // ---- Privacy: contact details and accusations stay out of the index
  // Our own data (directory, tariffs, advisories, reports) must never carry contact details. Public web
  // pages a moderator added are quoted as they are, links and all, and are not checked here.
  const all = await prisma.vectorRecord.findMany({ where: { document: { source: { via: "INTERNAL" } } }, select: { id: true, text: true, document: { select: { docType: true } } } });
  const leaks = all.filter((r) => /(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)|@[a-z]+\b|https?:\/\//i.test(r.text));
  check(`no phone number, UPI id, email or web address in any of the ${all.length} indexed chunks`, leaks.length === 0, leaks.slice(0, 3).map((l) => l.text.slice(0, 120)));
  const reports = all.filter((r) => r.document.docType === "report");
  check("every report chunk says it is not verified", reports.length > 0 && reports.every((r) => /not verified/.test(r.text)));
  const rejected = await prisma.report.findMany({ where: { status: "REJECTED" }, select: { id: true } });
  check("rejected reports are not indexed", rejected.every((r) => !all.some((c) => c.id.startsWith(`${r.id}:`))) && !(await prisma.knowledgeDocument.count({ where: { reportId: { in: rejected.map((r) => r.id) } } })));

  // ---- Retrieval: the plan's done-when
  const taxi = await retrieve("taxi fare Shillong airport sedan");
  const top = taxi[0];
  check("'taxi fare Shillong airport sedan' returns the seeded tariff chunk first, with its link", !!top && top.type === "tariff" && /Shillong/.test(top.text) && /sedan/i.test(top.text) && /Rs [\d,]+ to Rs [\d,]+ per trip/.test(top.text) && !!top.url && top.url.startsWith("/price?service=TAXI"), taxi.slice(0, 2));
  check("the hit carries its source from our database: source name, retrieval time, document id", top.sourceName === "Tariff benchmarks" && !Number.isNaN(Date.parse(top.retrievedAt)) && top.id.startsWith(`${top.documentId}:`) && top.score > 0.5, top);
  check("results come back best first", taxi.length === 5 && taxi.every((h, i) => i === 0 || taxi[i - 1].score >= h.score));
  const hindi = await retrieve("शिलांग एयरपोर्ट से सेडान टैक्सी का किराया", { topK: 3 });
  check("a Hindi question finds the same kind of tariff (the model is multilingual)", hindi[0]?.type === "tariff" && /Shillong/.test(hindi[0].text), hindi.slice(0, 2));

  // ---- Scoping and filters
  const adv = await retrieve("fake booking pages", { types: ["ADVISORY"] });
  check("scoping to one type returns only that type", adv.length > 0 && adv.every((h) => h.type === "advisory"), adv.map((h) => h.type));
  const maj = await retrieve("homestay", { types: ["DIRECTORY"], district: "Majuli", topK: 10 });
  check("a district filter returns only that district", maj.length > 0 && maj.every((h) => h.district === "Majuli"), maj.map((h) => h.district));
  const verified = await retrieve("advance payment scam", { types: ["REPORT"], filter: { status: { $in: ["VERIFIED"] } }, topK: 10 });
  const verifiedRows = await prisma.report.findMany({ where: { status: "VERIFIED" }, select: { reference: true } });
  check("a metadata filter (status) is applied: only verified reports", verified.length > 0 && verified.every((h) => h.status === "VERIFIED" && verifiedRows.some((r) => h.title.includes(r.reference))), verified.map((h) => [h.title, h.status]));
  const reranked = await retrieve("taxi fare Shillong airport sedan", { rerank: true, topK: 3 });
  check("rerank returns the best few, ordered, with relevance scores", reranked.length === 3 && reranked.every((h, i) => h.score >= 0 && h.score <= 1 && (i === 0 || reranked[i - 1].score >= h.score)) && reranked[0].type === "tariff", reranked.map((h) => [h.title, h.score]));
  check("an empty query returns nothing, and topK is clamped", (await retrieve("   ")).length === 0 && (await retrieve("taxi", { topK: 500 })).length <= 20);

  // ---- An orphan vector (in Pinecone but not in our database) is never returned
  await index(NAMESPACE.TARIFF).upsertRecords({ records: [{ _id: "orphan-doc:0", text: "taxi fare Shillong airport sedan Rs 1 to Rs 2 per trip orphan", title: "Orphan", type: "tariff", source: "x", sourceId: "x", docId: "orphan-doc", language: "en", retrievedAt: new Date().toISOString(), retrievedTs: Date.now(), chunk: 0 }] });
  const withOrphan = await until(() => index(NAMESPACE.TARIFF).searchRecords({ query: { topK: 3, inputs: { text: "taxi fare Shillong airport sedan orphan" } }, fields: ["title"] }), (r) => r.result.hits.some((h) => h._id === "orphan-doc:0"));
  const sawInPinecone = withOrphan.result.hits.some((h) => h._id === "orphan-doc:0");
  const viaRetrieve = await retrieve("taxi fare Shillong airport sedan orphan", { types: ["TARIFF"], topK: 10 });
  check("a vector with no document in our database is never returned", sawInPinecone && !viaRetrieve.some((h) => h.id === "orphan-doc:0"), { sawInPinecone, ids: viaRetrieve.map((h) => h.id) });
  await index(NAMESPACE.TARIFF).deleteMany({ ids: ["orphan-doc:0"] });

  // ---- A changed document is re-embedded; a long one is split and shrinking removes the extra chunks
  const adSource = "internal-advisories";
  const ad = await prisma.advisory.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });
  const baseline = await dbChunks(adSource);
  const para = (n: number) => `Paragraph ${n} about a fake houseboat booking scheme at Dibrugarh. ${"Scammers copy real hotel photos, ask for a deposit on a personal account and then stop answering messages. ".repeat(14)}`;
  try {
    await prisma.advisory.update({ where: { id: ad.id }, data: { body: [para(1), para(2), para(3)].join("\n\n") } });
    const grown = await syncSource(adSource);
    check("editing an advisory re-indexes only that advisory, and its long text becomes several chunks", grown.changed === 1 && grown.unchanged === grown.documents - 1 && grown.chunks > baseline + 1, grown);
    const found = await until(() => retrieve("fake houseboat booking scheme Dibrugarh", { types: ["ADVISORY"], topK: 3 }), (h) => h[0]?.documentId !== undefined && /houseboat/.test(h[0].text));
    check("the edited text is searchable", /houseboat/.test(found[0]?.text ?? ""), found[0]);
    const grownCounts = await until(namespaceCounts, (c) => c[NAMESPACE.ADVISORY] === grown.chunks);
    check("Pinecone holds exactly the new chunks", grownCounts[NAMESPACE.ADVISORY] === grown.chunks, grownCounts);
  } finally {
    await prisma.advisory.update({ where: { id: ad.id }, data: { body: ad.body } });
  }
  const shrunk = await syncSource(adSource);
  check("putting the text back re-indexes it and the extra chunks are deleted from Pinecone and the database", shrunk.changed === 1 && shrunk.chunks === baseline, { shrunk, baseline });
  const shrunkCounts = await until(namespaceCounts, (c) => c[NAMESPACE.ADVISORY] === baseline);
  check("Pinecone is back to the original record count", shrunkCounts[NAMESPACE.ADVISORY] === baseline, shrunkCounts);
  const gone = await retrieve("fake houseboat booking scheme Dibrugarh", { types: ["ADVISORY"], topK: 5 });
  check("the old long text no longer comes back", !gone.some((h) => /houseboat/.test(h.text)), gone.map((h) => h.title));

  // ---- A document that leaves the source is removed from the index
  const prop = await prisma.property.findFirstOrThrow({ where: { isActive: true, slug: "majuli-mishing-homestay" } });
  const before = await namespaceCounts();
  try {
    await prisma.property.update({ where: { id: prop.id }, data: { isActive: false } });
    const removed = await syncSource("internal-directory");
    check("a deactivated place is removed from the index and the database", removed.removed === 1 && !(await prisma.knowledgeDocument.count({ where: { externalKey: `property:${prop.id}` } })), removed);
    const afterCounts = await until(namespaceCounts, (c) => c[NAMESPACE.DIRECTORY] === before[NAMESPACE.DIRECTORY] - 1);
    check("Pinecone lost exactly that record", afterCounts[NAMESPACE.DIRECTORY] === before[NAMESPACE.DIRECTORY] - 1, { before: before[NAMESPACE.DIRECTORY], after: afterCounts[NAMESPACE.DIRECTORY] });
    const search = await retrieve("Majuli Mishing Homestay", { types: ["DIRECTORY"], topK: 5 });
    check("it can no longer be found", !search.some((h) => h.title === prop.name), search.map((h) => h.title));
  } finally {
    await prisma.property.update({ where: { id: prop.id }, data: { isActive: true } });
  }
  const restored = await syncSource("internal-directory");
  check("reactivating it brings it back", restored.changed === 1 && restored.documents === first[KNOWLEDGE_TYPES.indexOf("DIRECTORY")].documents);

  // ---- A source we cannot read fails cleanly, with a reason
  await prisma.knowledgeSource.create({ data: { id: "test-upload-source", name: "Test upload", type: "TARIFF", via: "UPLOAD", pineconeNamespace: "tariffs" } });
  try {
    let message = "";
    await syncSource("test-upload-source").catch((e) => (message = String(e.message)));
    const s = await prisma.knowledgeSource.findUniqueOrThrow({ where: { id: "test-upload-source" } });
    check("a source with no reader ends FAILED with a readable reason, not a crash", s.status === "FAILED" && /indexed when their files are added/.test(s.error ?? "") && message.length > 0, s);
  } finally {
    await prisma.knowledgeSource.delete({ where: { id: "test-upload-source" } });
  }

  // ---- The index ends up exactly as it should
  const wantFinal = await expected();
  const finalCounts = await until(namespaceCounts, (c) => KNOWLEDGE_TYPES.every((t) => c[NAMESPACE[t]] === wantFinal[NAMESPACE[t]]));
  check("finally: the index holds exactly the real data again", KNOWLEDGE_TYPES.every((t) => finalCounts[NAMESPACE[t]] === wantFinal[NAMESPACE[t]]), { finalCounts, wantFinal });
}

main()
  .catch((e) => { console.error(e); fails++; })
  .finally(async () => {
    console.log(fails ? `\n${fails} FAILED` : "\nAll knowledge checks passed");
    process.exit(fails ? 1 : 0);
  });
