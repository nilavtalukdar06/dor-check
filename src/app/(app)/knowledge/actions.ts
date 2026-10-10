"use server";

import { inngest } from "@/inngest/client";
import { sourceSyncRequested } from "@/inngest/events";
import { KNOWLEDGE_TYPES } from "@/lib/knowledge";
import prisma from "@/lib/prisma";
import { pineconeConfigured } from "@/server/pinecone";
import { consumeRateLimit } from "@/server/rate-limit";
import { retrieve, type RetrievedChunk } from "@/server/retrieve";
import { requireRole } from "@/server/roles";
import { getCurrentUser } from "@/server/users";

/** A sync that has been "running" this long is stuck, so it may be started again. */
const STUCK_MS = 15 * 60 * 1000;

/** Moderators can re-sync a source on demand; the sync itself runs as a durable Inngest workflow. */
export async function syncSourceAction(sourceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole("MODERATOR");
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!pineconeConfigured()) return { ok: false, error: "The vector index is not set up (PINECONE_API_KEY, PINECONE_INDEX)." };
  if (!(await consumeRateLimit(`knowledge-sync:${user.id}`, 30, 3600))) return { ok: false, error: "Too many syncs this hour. Try again later." };

  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId }, select: { id: true, status: true, updatedAt: true } });
  if (!source) return { ok: false, error: "That source no longer exists." };
  if (source.status === "SYNCING" && Date.now() - source.updatedAt.getTime() < STUCK_MS) return { ok: false, error: "This source is already syncing." };

  await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { status: "SYNCING", error: null } });
  try {
    await inngest.send(sourceSyncRequested.create({ sourceId, requestedById: user.id }));
  } catch {
    await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { status: "FAILED", error: "Worker unreachable" } });
    return { ok: false, error: "We could not start the sync right now. Please try again in a moment." };
  }
  return { ok: true };
}

export type TestQueryState = { query: string; hits?: RetrievedChunk[]; error?: string } | undefined;

/** "Test a query": what the agent would find for this text, with scores. */
export async function testQueryAction(_prev: TestQueryState, form: FormData): Promise<TestQueryState> {
  await requireRole("MODERATOR");
  const query = String(form.get("query") ?? "").trim().slice(0, 300);
  if (!query) return { query, error: "Type a question to test." };
  const user = await getCurrentUser();
  if (!user) return { query, error: "Sign in first." };
  if (!pineconeConfigured()) return { query, error: "The vector index is not set up." };
  if (!(await consumeRateLimit(`knowledge-query:${user.id}`, 60, 3600))) return { query, error: "Too many test queries this hour." };
  try {
    const hits = await retrieve(query, { topK: 5, types: KNOWLEDGE_TYPES });
    return { query, hits };
  } catch {
    return { query, error: "The search service did not answer. Please try again." };
  }
}
