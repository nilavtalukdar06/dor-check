import { Pinecone } from "@pinecone-database/pinecone";
import { env } from "@/lib/env";
import { batches, type ChunkRecord } from "@/lib/knowledge";
import { withRetry } from "@/lib/retry";

// The vector index. It is an *integrated* index: Pinecone embeds the `text` field with its hosted
// model (llama-text-embed-v2), so we send text and never call an embedding API ourselves.

/** Pinecone accepts at most 96 text records per upsert request. */
const UPSERT_BATCH = 90;
const RERANK_MODEL = "bge-reranker-v2-m3";

let cached: Pinecone | null = null;

export const pineconeConfigured = () =>
  Boolean(env.PINECONE_API_KEY && env.PINECONE_INDEX);

function client() {
  if (!pineconeConfigured())
    throw new Error(
      "Pinecone is not configured (PINECONE_API_KEY, PINECONE_INDEX)",
    );
  cached ??= new Pinecone({ apiKey: env.PINECONE_API_KEY! });
  return cached;
}

const index = (namespace: string) =>
  client().index({ name: env.PINECONE_INDEX!, namespace });

/** A rate limit or a server error may pass on a retry; a bad request or a bad key will not. */
const retryable = (err: unknown) =>
  !/\b(400|401|403|404)\b|PineconeBadRequest|PineconeAuthorization|PineconeNotFound/i.test(
    String(err),
  );
const call = <T>(fn: () => Promise<T>, timeoutMs = 25_000) =>
  withRetry(fn, { retries: 2, timeoutMs, shouldRetry: retryable });

/** Write whole records (an integrated index cannot update text in place). The same `_id` overwrites. */
export async function upsertChunks(namespace: string, records: ChunkRecord[]) {
  for (const batch of batches(records, UPSERT_BATCH)) {
    await call(
      () => index(namespace).upsertRecords({ records: batch }),
      45_000,
    );
  }
}

export async function deleteChunks(namespace: string, ids: string[]) {
  for (const batch of batches(ids, 500)) {
    await call(() => index(namespace).deleteMany({ ids: batch }));
  }
}

export type PineconeHit = {
  id: string;
  score: number;
  fields: Record<string, unknown>;
};

export async function searchChunks(
  namespace: string,
  query: string,
  { topK, filter }: { topK: number; filter?: Record<string, unknown> },
): Promise<PineconeHit[]> {
  const res = await call(() =>
    index(namespace).searchRecords({
      query: { topK, inputs: { text: query }, ...(filter ? { filter } : {}) },
      fields: [
        "text",
        "title",
        "url",
        "type",
        "source",
        "district",
        "retrievedAt",
        "docId",
        "status",
      ],
    }),
  );
  return res.result.hits.map((h) => ({
    id: h._id,
    score: h._score,
    fields: (h.fields ?? {}) as Record<string, unknown>,
  }));
}

/** Second-pass relevance ordering over candidates from any namespace. Returns the new order with scores. */
export async function rerank(
  query: string,
  candidates: { id: string; text: string }[],
  topN: number,
) {
  if (candidates.length === 0) return [];
  const res = await call(() =>
    client().inference.rerank({
      model: RERANK_MODEL,
      query,
      documents: candidates.map((c) => c.text),
      topN,
      returnDocuments: false,
    }),
  );
  return res.data.map((d) => ({ id: candidates[d.index].id, score: d.score }));
}

/** Live record counts per namespace, straight from Pinecone. */
export async function namespaceCounts(): Promise<Record<string, number>> {
  const stats = await call(() =>
    client().index({ name: env.PINECONE_INDEX! }).describeIndexStats(),
  );
  return Object.fromEntries(
    Object.entries(stats.namespaces ?? {}).map(([ns, s]) => [
      ns,
      s.recordCount ?? 0,
    ]),
  );
}
