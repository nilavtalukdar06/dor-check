import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  advisoryDraft,
  batches,
  buildRecords,
  chunkText,
  draftHash,
  EMBEDDING,
  INTERNAL_SOURCES,
  knowledgeTypeOf,
  mapLimit,
  NAMESPACE,
  pageDraft,
  propertyDraft,
  reportDraft,
  tariffDraft,
  type DocDraft,
} from "@/lib/knowledge";
import { hostOf } from "@/lib/research-policy";
import {
  deleteChunks,
  pineconeConfigured,
  upsertChunks,
} from "@/server/pinecone";
import { scrapeUrl } from "@/server/research";

// Filling the vector index. A sync is staged so each stage can be one durable Inngest step:
//   collect  -> read the source and update our documents (nothing is embedded yet)
//   index    -> chunk the changed documents and upsert them to Pinecone, then record the chunks
//   prune    -> remove documents that left the source, from Pinecone and from our database
//   finish   -> record counts and status
// Our database is the source of truth. Unchanged documents (same content hash) are skipped.

/** Documents indexed per step, so one step stays well inside a request's time limit. */
export const INDEX_BATCH = 20;
const WEB_PAGE_TOKENS = 12_000;
const MAX_WEB_PAGES = 25;

export type SyncStats = {
  documents: number;
  changed: number;
  unchanged: number;
  removed: number;
  chunks: number;
  durationMs: number;
};

/** The four internal sources exist from the start; fake demo sources from the seed are replaced. */
export async function ensureInternalSources() {
  await prisma.knowledgeSource.deleteMany({
    where: { id: { startsWith: "seed-source-" } },
  });
  for (const s of INTERNAL_SOURCES) {
    await prisma.knowledgeSource.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        host: "Internal",
        type: s.type,
        via: "INTERNAL",
        recordUnit: s.recordUnit,
        pineconeNamespace: NAMESPACE[s.type],
        isLive: s.isLive,
      },
      update: {
        name: s.name,
        type: s.type,
        via: "INTERNAL",
        recordUnit: s.recordUnit,
        pineconeNamespace: NAMESPACE[s.type],
        isLive: s.isLive,
      },
    });
  }
}

type Source = {
  id: string;
  name: string;
  type: string;
  via: string;
  crawlUrl: string | null;
  config: Prisma.JsonValue;
  pineconeNamespace: string | null;
};

export function namespaceOf(
  source: Pick<Source, "type" | "pineconeNamespace">,
) {
  const type = knowledgeTypeOf(source.type);
  return source.pineconeNamespace ?? (type ? NAMESPACE[type] : "documents");
}

/** Read what the source holds now, as documents ready to store. */
export async function buildDrafts(source: Source): Promise<DocDraft[]> {
  if (source.via === "INTERNAL") {
    switch (knowledgeTypeOf(source.type)) {
      case "TARIFF": {
        const rows = await prisma.tariffBenchmark.findMany({
          where: { isActive: true, reviewStatus: "approved" },
          include: {
            originPlace: { select: { name: true } },
            destinationPlace: { select: { name: true } },
            district: { select: { name: true } },
          },
        });
        return rows.map((b) =>
          tariffDraft({
            id: b.id,
            serviceType: b.serviceType,
            vehicle: b.vehicle,
            qualifier: b.qualifier,
            unit: b.unit,
            lowInr: b.lowInr,
            highInr: b.highInr,
            distanceKm: b.distanceKm === null ? null : Number(b.distanceKm),
            durationMin: b.durationMin,
            via: b.via,
            nightSurchargePct: b.nightSurchargePct,
            sourceLabel: b.sourceLabel,
            sourceUrl: b.sourceUrl,
            effectiveOn: b.effectiveOn,
            basis: b.basis,
            originName: b.originPlace?.name ?? null,
            destinationName: b.destinationPlace?.name ?? null,
            districtId: b.districtId,
            districtName: b.district?.name ?? null,
          }),
        );
      }
      case "DIRECTORY": {
        const rows = await prisma.property.findMany({
          where: { isActive: true },
          include: { district: { select: { name: true } } },
        });
        return rows.map((p) =>
          propertyDraft({
            id: p.id,
            slug: p.slug,
            name: p.name,
            type: p.type,
            description: p.description,
            domain: p.domain,
            tags: p.tags,
            verified: p.verified,
            districtId: p.districtId,
            districtName: p.district.name,
            updatedAt: p.updatedAt,
          }),
        );
      }
      case "ADVISORY": {
        const rows = await prisma.advisory.findMany({
          where: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { district: { select: { name: true } } },
        });
        return rows.map((a) =>
          advisoryDraft({
            id: a.id,
            title: a.title,
            body: a.body,
            kind: a.kind,
            label: a.label,
            sourceUrl: a.sourceUrl,
            districtId: a.districtId,
            districtName: a.district?.name ?? null,
            publishedAt: a.publishedAt,
          }),
        );
      }
      case "REPORT": {
        // Public, not hidden and not rejected: a rejected report is not credible enough to quote.
        const rows = await prisma.report.findMany({
          where: {
            deletedAt: null,
            visibility: "PUBLIC",
            hiddenReason: null,
            status: { not: "REJECTED" },
          },
          include: { district: { select: { name: true } } },
        });
        return rows.map((r) =>
          reportDraft({
            id: r.id,
            reference: r.reference,
            category: r.category,
            summary: r.summary,
            description: r.description,
            locationText: r.locationText,
            status: r.status,
            amountInr: r.amountInr,
            districtId: r.districtId,
            districtName: r.district.name,
            incidentAt: r.incidentAt,
            createdAt: r.createdAt,
          }),
        );
      }
      default:
        throw new Error(`Unknown source type ${source.type}`);
    }
  }

  if (source.via === "FIRECRAWL") {
    const configured = (source.config as { urls?: unknown } | null)?.urls;
    const urls = [
      ...new Set([
        ...(Array.isArray(configured)
          ? configured.filter((u): u is string => typeof u === "string")
          : []),
        ...(source.crawlUrl ? [source.crawlUrl] : []),
      ]),
    ].slice(0, MAX_WEB_PAGES);
    if (urls.length === 0)
      throw new Error("This source has no address to read");
    const drafts: DocDraft[] = [];
    for (const url of urls) {
      const page = await scrapeUrl(url, { tokenBudget: WEB_PAGE_TOKENS });
      if (page.ok)
        drafts.push(
          pageDraft({
            url: page.url,
            title: page.title,
            text: page.text,
            retrievedAt: new Date(page.retrievedAt),
          }),
        );
    }
    if (drafts.length === 0)
      throw new Error(
        `None of the pages could be read (${urls.map(hostOf).join(", ")})`,
      );
    return drafts;
  }

  throw new Error(
    `Sources added by ${source.via.toLowerCase()} are indexed when their files are added`,
  );
}

const asExtra = (v: Prisma.JsonValue | null) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, string | number | boolean>)
    : {};
const toJson = (v: Record<string, string | number | boolean>) =>
  v as Prisma.InputJsonValue;

/** Stage 1: bring our documents in line with the source. Returns which ones need (re-)embedding. */
export async function collectDocuments(source: Source) {
  const drafts = await buildDrafts(source);
  const existing = await prisma.knowledgeDocument.findMany({
    where: { sourceId: source.id },
    select: { id: true, externalKey: true, contentHash: true },
  });
  const byKey = new Map(
    existing.filter((d) => d.externalKey).map((d) => [d.externalKey!, d]),
  );
  const seen = new Set<string>();
  const changedIds: string[] = [];

  // Each upsert is atomic and safe to repeat, so there is no outer transaction (Neon round trips are slow).
  for (const group of batches(drafts, 12)) {
    const ops = group.map((d) => {
      seen.add(d.externalKey);
      const prior = byKey.get(d.externalKey);
      const fields = {
        docType: d.docType,
        title: d.title,
        url: d.url,
        text: d.text,
        language: d.language,
        metadata: toJson(d.extra),
        districtId: d.districtId,
        publishedAt: d.publishedAt,
        benchmarkId: d.links.benchmarkId ?? null,
        propertyId: d.links.propertyId ?? null,
        reportId: d.links.reportId ?? null,
      };
      const changed = !prior || prior.contentHash !== draftHash(d);
      return {
        d,
        changed,
        op: prisma.knowledgeDocument.upsert({
          where: {
            sourceId_externalKey: {
              sourceId: source.id,
              externalKey: d.externalKey,
            },
          },
          // The hash stays "pending" until the document is really in the index.
          create: {
            sourceId: source.id,
            externalKey: d.externalKey,
            contentHash: "pending",
            ...fields,
          },
          update: {
            ...fields,
            ...(changed ? { retrievedAt: new Date() } : {}),
          },
          select: { id: true },
        }),
      };
    });
    const saved = await Promise.all(ops.map((o) => o.op));
    saved.forEach((row, i) => {
      if (ops[i].changed) changedIds.push(row.id);
    });
    // An advisory points at its document so the dashboard can show where it came from.
    await Promise.all(
      group.flatMap((d, i) =>
        d.links.advisoryId
          ? [
              prisma.advisory.update({
                where: { id: d.links.advisoryId },
                data: { documentId: saved[i].id },
              }),
            ]
          : [],
      ),
    );
  }

  const removedIds = existing
    .filter((d) => !d.externalKey || !seen.has(d.externalKey))
    .map((d) => d.id);
  return {
    total: drafts.length,
    changedIds,
    removedIds,
    unchanged: drafts.length - changedIds.length,
  };
}

/** Stage 2: chunk the given documents, upsert them to Pinecone, then record the chunks. */
export async function indexDocuments(sourceId: string, documentIds: string[]) {
  if (documentIds.length === 0) return { documents: 0, chunks: 0 };
  if (!pineconeConfigured()) throw new Error("Pinecone is not configured");
  const source = await prisma.knowledgeSource.findUniqueOrThrow({
    where: { id: sourceId },
  });
  const namespace = namespaceOf(source);
  const docs = await prisma.knowledgeDocument.findMany({
    where: { id: { in: documentIds }, sourceId },
    include: {
      district: { select: { name: true } },
      chunks: { select: { id: true } },
    },
  });

  const records = docs.flatMap((doc) =>
    buildRecords(
      {
        ...doc,
        districtName: doc.district?.name ?? null,
        extra: asExtra(doc.metadata),
      },
      source,
      chunkText(doc.text ?? ""),
    ),
  );
  const newIds = new Set(records.map((r) => r._id));
  const staleIds = docs
    .flatMap((d) => d.chunks.map((c) => c.id))
    .filter((id) => !newIds.has(id));

  // Pinecone first: if it fails nothing is recorded and the step can simply run again.
  await upsertChunks(namespace, records);
  await deleteChunks(namespace, staleIds);

  const now = new Date();
  await mapLimit(docs, 6, async (doc) => {
    const mine = records.filter((r) => r._id.startsWith(`${doc.id}:`));
    await prisma.$transaction([
      prisma.vectorRecord.deleteMany({ where: { documentId: doc.id } }),
      prisma.vectorRecord.createMany({
        data: mine.map((r) => {
          const { _id, text, ...metadata } = r;
          return {
            id: _id,
            documentId: doc.id,
            chunkIndex: Number(r.chunk),
            text: String(text),
            tokenCount: Math.ceil(String(text).length / 4),
            metadata,
            embeddingModel: EMBEDDING.model,
            embeddingDim: EMBEDDING.dimension,
            upsertedAt: now,
          };
        }),
      }),
      prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: {
          contentHash: draftHash({
            title: doc.title,
            url: doc.url,
            text: doc.text ?? "",
            districtName: doc.district?.name ?? null,
            extra: asExtra(doc.metadata),
          }),
        },
      }),
    ]);
  });
  return { documents: docs.length, chunks: records.length };
}

/** Stage 3: documents that left the source go from Pinecone first, then from our database. */
export async function pruneDocuments(sourceId: string, documentIds: string[]) {
  if (documentIds.length === 0) return 0;
  const source = await prisma.knowledgeSource.findUniqueOrThrow({
    where: { id: sourceId },
  });
  const chunks = await prisma.vectorRecord.findMany({
    where: { documentId: { in: documentIds } },
    select: { id: true },
  });
  await deleteChunks(
    namespaceOf(source),
    chunks.map((c) => c.id),
  );
  const res = await prisma.knowledgeDocument.deleteMany({
    where: { id: { in: documentIds }, sourceId },
  });
  return res.count;
}

/** Stage 4: counts and status. */
export async function finishSync(
  sourceId: string,
  stats: Omit<SyncStats, "chunks">,
) {
  const chunks = await prisma.vectorRecord.count({
    where: { document: { sourceId } },
  });
  const documents = await prisma.knowledgeDocument.count({
    where: { sourceId },
  });
  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: {
      status: "INDEXED",
      recordCount: documents,
      lastSyncedAt: new Date(),
      lastSyncDurationMs: stats.durationMs,
      error: null,
    },
  });
  return { ...stats, chunks };
}

export async function failSync(sourceId: string, message: string) {
  await prisma.knowledgeSource
    .update({
      where: { id: sourceId },
      data: { status: "FAILED", error: message.slice(0, 300) },
    })
    .catch(() => undefined);
}

/** The whole sync in one call (scripts and tests). The Inngest function runs the same stages as steps. */
export async function syncSource(sourceId: string): Promise<SyncStats> {
  const started = Date.now();
  const source = await prisma.knowledgeSource.findUniqueOrThrow({
    where: { id: sourceId },
  });
  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: "SYNCING", error: null },
  });
  try {
    const found = await collectDocuments(source);
    for (const group of batches(found.changedIds, INDEX_BATCH))
      await indexDocuments(sourceId, group);
    const removed = await pruneDocuments(sourceId, found.removedIds);
    return await finishSync(sourceId, {
      documents: found.total,
      changed: found.changedIds.length,
      unchanged: found.unchanged,
      removed,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    await failSync(sourceId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
