import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { kindsFor, type EvidenceKindName, type EvidenceTab } from "@/lib/evidence";
import prisma from "@/lib/prisma";
import { keyFromRef, signedUrl, storageConfigured } from "@/server/storage";

export const VAULT_PAGE_SIZE = 60;

/** Grid thumbnails stay valid for an hour so a vault left open keeps its pictures. */
const THUMB_TTL = 3600;

export type EvidenceItem = {
  id: string;
  kind: EvidenceKindName;
  title: string;
  subject: string | null;
  url: string | null;
  capturedAt: Date;
  capturedBy: string;
  thumbnail: string | null;
};

export type EvidenceDetail = EvidenceItem & {
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  browserSessionId: string | null;
  textContent: string | null;
  /** Full-size picture for images. */
  imageUrl: string | null;
  investigation: { id: string; title: string } | null;
  reportCount: number;
};

const isImage = (mime: string) => mime.startsWith("image/");

async function link(storageUrl: string, seconds = THUMB_TTL) {
  const key = keyFromRef(storageUrl);
  if (!key || !storageConfigured()) return null;
  try {
    return await signedUrl(key, seconds);
  } catch {
    return null;
  }
}

/** The where-clause shared by the grid and "Download all". Always limited to the owner. */
export function vaultWhere(userId: string, filters: { type: EvidenceTab; q?: string }): Prisma.EvidenceWhereInput {
  const kinds = kindsFor(filters.type);
  return {
    ownerId: userId,
    deletedAt: null,
    ...(kinds ? { kind: { in: [...kinds] } } : {}),
    ...(filters.q
      ? {
          OR: [
            { title: { contains: filters.q, mode: "insensitive" } },
            { subject: { contains: filters.q, mode: "insensitive" } },
            { url: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listEvidence(userId: string, filters: { type: EvidenceTab; q?: string }) {
  const where = vaultWhere(userId, filters);
  const [rows, total] = await Promise.all([
    prisma.evidence.findMany({ where, orderBy: { capturedAt: "desc" }, take: VAULT_PAGE_SIZE }),
    prisma.evidence.count({ where }),
  ]);
  const items: EvidenceItem[] = await Promise.all(
    rows.map(async (e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      subject: e.subject,
      url: e.url,
      capturedAt: e.capturedAt,
      capturedBy: e.capturedBy,
      thumbnail: isImage(e.mimeType) ? await link(e.storageUrl) : null,
    })),
  );
  return { items, total };
}

/** One item, only for its owner. */
export async function getEvidenceDetail(userId: string, id: string): Promise<EvidenceDetail | null> {
  const e = await prisma.evidence.findFirst({
    where: { id, ownerId: userId, deletedAt: null },
    include: { investigation: { select: { id: true, title: true } }, _count: { select: { reports: true } } },
  });
  if (!e) return null;
  const imageUrl = isImage(e.mimeType) ? await link(e.storageUrl) : null;
  return {
    id: e.id,
    kind: e.kind,
    title: e.title,
    subject: e.subject,
    url: e.url,
    capturedAt: e.capturedAt,
    capturedBy: e.capturedBy,
    thumbnail: imageUrl,
    mimeType: e.mimeType,
    sizeBytes: e.sizeBytes,
    width: e.width,
    height: e.height,
    sha256: e.sha256,
    browserSessionId: e.browserSessionId,
    textContent: e.textContent,
    imageUrl,
    investigation: e.investigation,
    reportCount: e._count.reports,
  };
}
