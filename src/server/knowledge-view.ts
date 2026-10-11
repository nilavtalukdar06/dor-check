import "server-only";

import { env } from "@/lib/env";
import prisma from "@/lib/prisma";
import { pineconeConfigured } from "@/server/pinecone";

export type SourceRow = {
  id: string;
  name: string;
  host: string | null;
  via: "FIRECRAWL" | "UPLOAD" | "INTERNAL" | "MANUAL";
  type: string;
  recordCount: number;
  recordUnit: string;
  chunkCount: number;
  status: "PENDING" | "SYNCING" | "INDEXED" | "FAILED" | "PAUSED";
  isLive: boolean;
  lastSyncedAt: Date | null;
  error: string | null;
  /** "Syncing" for longer than any sync takes: the run was lost (a restart, a timeout). Shown as stuck, and it can be synced again. */
  stuck: boolean;
};

export type KnowledgeOverview = {
  configured: boolean;
  indexName: string | null;
  vectors: number;
  lastSyncedAt: Date | null;
  sources: SourceRow[];
};

/** What the Knowledge screen shows. Chunk counts come from our database, which mirrors what was upserted. */
/** A sync times out after 15 minutes, so one "running" longer than that is not running. */
export const SYNC_STUCK_MS = 15 * 60 * 1000;

export async function getKnowledgeOverview(): Promise<KnowledgeOverview> {
  const now = Date.now();
  const [sources, chunkRows] = await Promise.all([
    prisma.knowledgeSource.findMany({ orderBy: { name: "asc" } }),
    prisma.vectorRecord.findMany({
      select: { document: { select: { sourceId: true } } },
    }),
  ]);
  const chunkCounts = new Map<string, number>();
  for (const r of chunkRows)
    chunkCounts.set(
      r.document.sourceId,
      (chunkCounts.get(r.document.sourceId) ?? 0) + 1,
    );
  const synced = sources
    .map((s) => s.lastSyncedAt)
    .filter((d): d is Date => !!d);
  return {
    configured: pineconeConfigured(),
    indexName: env.PINECONE_INDEX ?? null,
    vectors: [...chunkCounts.values()].reduce((a, b) => a + b, 0),
    lastSyncedAt: synced.length
      ? new Date(Math.max(...synced.map((d) => d.getTime())))
      : null,
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      host: s.host,
      via: s.via,
      type: s.type,
      recordCount: s.recordCount,
      recordUnit: s.recordUnit,
      chunkCount: chunkCounts.get(s.id) ?? 0,
      status: s.status,
      isLive: s.isLive,
      lastSyncedAt: s.lastSyncedAt,
      error: s.error,
      stuck: s.status === "SYNCING" && now - s.updatedAt.getTime() > SYNC_STUCK_MS,
    })),
  };
}
