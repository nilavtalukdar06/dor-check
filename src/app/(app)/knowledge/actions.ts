"use server";

import { revalidatePath } from "next/cache";
import { inngest } from "@/inngest/client";
import { sourceSyncRequested } from "@/inngest/events";
import { KNOWLEDGE_TYPES } from "@/lib/knowledge";
import { hostOf, isSafePublicUrl } from "@/lib/research-policy";
import { audit } from "@/server/audit";
import prisma from "@/lib/prisma";
import { SYNC_STUCK_MS } from "@/server/knowledge-view";
import { pineconeConfigured } from "@/server/pinecone";
import { consumeRateLimit } from "@/server/rate-limit";
import { retrieve, type RetrievedChunk } from "@/server/retrieve";
import { requireRole } from "@/server/roles";
import { getCurrentUser } from "@/server/users";


/** Moderators can re-sync a source on demand; the sync itself runs as a durable Inngest workflow. */
export async function syncSourceAction(sourceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole("MODERATOR");
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!pineconeConfigured()) return { ok: false, error: "The vector index is not set up (PINECONE_API_KEY, PINECONE_INDEX)." };
  if (!(await consumeRateLimit(`knowledge-sync:${user.id}`, 30, 3600))) return { ok: false, error: "Too many syncs this hour. Try again later." };

  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId }, select: { id: true, status: true, updatedAt: true } });
  if (!source) return { ok: false, error: "That source no longer exists." };
  if (source.status === "SYNCING" && Date.now() - source.updatedAt.getTime() < SYNC_STUCK_MS) return { ok: false, error: "This source is already syncing." };

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

export type AddSourceState = { ok?: boolean; error?: string; fields?: Record<string, string> } | undefined;
const WEB_TYPES = ["ADVISORY", "TARIFF", "DIRECTORY"] as const;

/** Add a public web page as a knowledge source and start reading it. */
export async function addSourceAction(_prev: AddSourceState, form: FormData): Promise<AddSourceState> {
  await requireRole("MODERATOR");
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const type = String(form.get("type") ?? "");
  const raw = String(form.get("url") ?? "").trim();
  const url = raw && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw;
  const fields: Record<string, string> = {};
  if (name.length < 3) fields.name = "Give the source a name.";
  if (!(WEB_TYPES as readonly string[]).includes(type)) fields.type = "Choose what the page holds.";
  if (!url || url.length > 500 || !isSafePublicUrl(url)) fields.url = "Enter a public http or https address.";
  if (Object.keys(fields).length) return { error: "Check the highlighted fields.", fields };
  if (await prisma.knowledgeSource.findFirst({ where: { crawlUrl: url }, select: { id: true } })) return { error: "That page is already a source.", fields: { url: "Already added." } };
  if (!(await consumeRateLimit(`knowledge-add:${user.id}`, 20, 3600))) return { error: "Too many new sources this hour." };

  const source = await prisma.knowledgeSource.create({
    data: { name, type, via: "FIRECRAWL", crawlUrl: url, host: hostOf(url).replace(/^www\./, ""), recordUnit: "pages", status: pineconeConfigured() ? "SYNCING" : "PENDING", createdById: user.id },
  });
  await audit(user.id, "knowledge_source.create", "KnowledgeSource", source.id, { url, type });
  if (pineconeConfigured()) {
    try {
      await inngest.send(sourceSyncRequested.create({ sourceId: source.id, requestedById: user.id }));
    } catch {
      await prisma.knowledgeSource.update({ where: { id: source.id }, data: { status: "FAILED", error: "Worker unreachable" } });
    }
  }
  revalidatePath("/knowledge");
  return { ok: true };
}
