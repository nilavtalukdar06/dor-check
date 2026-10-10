import { batches } from "@/lib/knowledge";
import prisma from "@/lib/prisma";
import { collectDocuments, failSync, finishSync, INDEX_BATCH, indexDocuments, pruneDocuments } from "@/server/knowledge";
import { inngest } from "../client";
import { sourceSyncRequested } from "../events";

/** One line in the run's timeline. */
const note = (runId: string, type: string, message: string) => prisma.runEvent.create({ data: { runId, type, message } });

/**
 * Durable knowledge sync: read the source, embed what changed through Pinecone, remove what is
 * gone, record the counts. Each stage is its own step, so a failure retries only that stage and
 * documents already indexed are not done again (unchanged ones are skipped by content hash).
 */
export const syncKnowledgeSource = inngest.createFunction(
  {
    id: "sync-knowledge-source",
    triggers: [sourceSyncRequested],
    retries: 2,
    concurrency: [{ key: "event.data.sourceId", limit: 1 }],
    timeouts: { finish: "15m" },
    onFailure: async ({ event, error }) => {
      const sourceId = (event.data.event.data as { sourceId?: string }).sourceId;
      if (!sourceId) return;
      await failSync(sourceId, error.message || "The sync could not finish");
      const runs = await prisma.workflowRun.findMany({ where: { knowledgeSourceId: sourceId, status: "RUNNING" }, select: { id: true } });
      for (const r of runs) {
        await prisma.workflowRun.update({ where: { id: r.id }, data: { status: "FAILED", finishedAt: new Date(), error: error.message?.slice(0, 300) } });
        await note(r.id, "sync_failed", "The sync could not finish");
      }
    },
  },
  async ({ event, step }) => {
    const { sourceId, requestedById } = event.data;

    const run = await step.run("start", async () => {
      const source = await prisma.knowledgeSource.findUniqueOrThrow({ where: { id: sourceId } });
      await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { status: "SYNCING", error: null } });
      const r = await prisma.workflowRun.create({
        data: {
          runCode: `run_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          type: "knowledge_sync",
          subject: source.name,
          status: "RUNNING",
          knowledgeSourceId: sourceId,
          userId: requestedById ?? null,
          startedAt: new Date(),
          stepsTotal: 4,
        },
      });
      await note(r.id, "sync_started", `Reading ${source.name}`);
      return { runId: r.id, startedAt: Date.now() };
    });

    const found = await step.run("collect", async () => {
      const source = await prisma.knowledgeSource.findUniqueOrThrow({ where: { id: sourceId } });
      const res = await collectDocuments(source);
      await note(run.runId, "documents_collected", `Found ${res.total} documents: ${res.changedIds.length} new or changed, ${res.unchanged} unchanged, ${res.removedIds.length} to remove`);
      return res;
    });

    let chunks = 0;
    for (const group of batches(found.changedIds, INDEX_BATCH)) {
      const done = await step.run("index", async () => {
        const res = await indexDocuments(sourceId, group);
        await note(run.runId, "chunks_indexed", `Indexed ${res.documents} documents as ${res.chunks} chunks`);
        return res;
      });
      chunks += done.chunks;
    }

    const removed = await step.run("prune", async () => {
      const n = await pruneDocuments(sourceId, found.removedIds);
      if (n > 0) await note(run.runId, "documents_removed", `Removed ${n} documents that left the source`);
      return n;
    });

    return step.run("finish", async () => {
      const stats = await finishSync(sourceId, { documents: found.total, changed: found.changedIds.length, unchanged: found.unchanged, removed, durationMs: Date.now() - run.startedAt });
      await note(run.runId, "sync_completed", `Done: ${stats.documents} documents, ${stats.chunks} chunks in the index`);
      await prisma.workflowRun.update({ where: { id: run.runId }, data: { status: "COMPLETED", finishedAt: new Date(), durationMs: stats.durationMs, stepsDone: 4 } });
      return { ...stats, chunksIndexed: chunks };
    });
  },
);
