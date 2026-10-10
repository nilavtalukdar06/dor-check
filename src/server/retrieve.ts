import prisma from "@/lib/prisma";
import {
  KNOWLEDGE_TYPES,
  NAMESPACE,
  type KnowledgeType,
} from "@/lib/knowledge";
import { rerank, searchChunks, type PineconeHit } from "@/server/pinecone";

export type RetrievedChunk = {
  /** "{documentId}:{chunkIndex}", the Pinecone record id. */
  id: string;
  documentId: string;
  /** Pinecone's similarity score (cosine, higher is closer). After a rerank it is the reranker's relevance. */
  score: number;
  text: string;
  title: string;
  /** Where it came from: a page URL or an app path. Null for things that have none (a report). */
  url: string | null;
  type: string;
  sourceName: string;
  sourceHost: string | null;
  district: string | null;
  /** When this version of the document was read from its source. */
  retrievedAt: string;
  /** For reports: NEW, UNDER_REVIEW, VERIFIED… */
  status: string | null;
};

export type RetrieveOptions = {
  /** Search only these knowledge types. Default: all four. */
  types?: readonly KnowledgeType[];
  /** How many chunks to return. Default 5. */
  topK?: number;
  /** District name, e.g. "Shillong". */
  district?: string;
  /** Any other Pinecone metadata filter, e.g. { status: { $in: ["VERIFIED"] } }. */
  filter?: Record<string, unknown>;
  /** Re-order the best candidates with Pinecone's reranker. Slower, more precise. */
  rerank?: boolean;
  /** Drop chunks scoring below this. */
  minScore?: number;
};

/**
 * Semantic search over the knowledge base. Pinecone finds the closest chunks (it embeds the
 * query itself, in any language); our database supplies the text and the source details, so
 * a vector whose document has since been removed can never be returned.
 */
export async function retrieve(
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const q = query.trim().slice(0, 500);
  if (!q) return [];
  const topK = Math.min(Math.max(options.topK ?? 5, 1), 20);
  const types = options.types?.length ? options.types : KNOWLEDGE_TYPES;
  const filter = {
    ...(options.district ? { district: { $eq: options.district } } : {}),
    ...(options.filter ?? {}),
  };
  const hasFilter = Object.keys(filter).length > 0;

  // Ask each namespace for a few more than needed so the merge has real choice.
  const perNamespace = types.length === 1 ? topK : Math.min(topK + 3, 20);
  const lists = await Promise.all(
    types.map((t) =>
      searchChunks(NAMESPACE[t], q, {
        topK: perNamespace,
        ...(hasFilter ? { filter } : {}),
      }),
    ),
  );
  let hits: PineconeHit[] = lists.flat().sort((a, b) => b.score - a.score);

  // The database is the source of truth: keep only chunks it still has.
  const rows = await prisma.vectorRecord.findMany({
    where: { id: { in: hits.map((h) => h.id) } },
    select: {
      id: true,
      text: true,
      document: {
        select: {
          id: true,
          title: true,
          url: true,
          docType: true,
          retrievedAt: true,
          metadata: true,
          district: { select: { name: true } },
          source: { select: { name: true, host: true } },
        },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  hits = hits.filter((h) => byId.has(h.id));

  if (options.rerank && hits.length > 1) {
    const order = await rerank(
      q,
      hits.slice(0, 20).map((h) => ({ id: h.id, text: byId.get(h.id)!.text })),
      topK,
    );
    const score = new Map(order.map((o) => [o.id, o.score]));
    hits = order.map((o) => ({
      ...hits.find((h) => h.id === o.id)!,
      score: score.get(o.id)!,
    }));
  }

  return hits
    .filter((h) => h.score >= (options.minScore ?? 0))
    .slice(0, topK)
    .map((h) => {
      const row = byId.get(h.id)!;
      const meta = (row.document.metadata ?? {}) as Record<string, unknown>;
      return {
        id: h.id,
        documentId: row.document.id,
        score: h.score,
        text: row.text,
        title: row.document.title,
        url: row.document.url,
        type: row.document.docType,
        sourceName: row.document.source.name,
        sourceHost: row.document.source.host,
        district: row.document.district?.name ?? null,
        retrievedAt: row.document.retrievedAt.toISOString(),
        status: typeof meta.status === "string" ? meta.status : null,
      };
    });
}
