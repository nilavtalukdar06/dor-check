// Fills the Pinecone index from our own tables (tariffs, directory, advisories, reports).
// Safe to run any time: unchanged documents are skipped. Usage: npm run knowledge:sync [sourceId]
import prismaModule from "../src/lib/prisma";
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { ensureInternalSources, syncSource } from "../src/server/knowledge";
import { namespaceCounts } from "../src/server/pinecone";

async function main() {
  await ensureInternalSources();
  const only = process.argv[2];
  const sources = await prisma.knowledgeSource.findMany({ where: only ? { id: only } : { via: "INTERNAL" }, orderBy: { name: "asc" } });
  for (const s of sources) {
    const t = Date.now();
    const stats = await syncSource(s.id);
    console.log(`${s.name.padEnd(26)} ${stats.documents} documents, ${stats.changed} indexed, ${stats.unchanged} unchanged, ${stats.removed} removed, ${stats.chunks} chunks (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
  console.log("Pinecone now holds:", JSON.stringify(await namespaceCounts()));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
