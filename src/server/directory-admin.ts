import "server-only";

import prisma from "@/lib/prisma";
import { keyFromRef, signedUrl, storageConfigured } from "@/server/storage";
import type { PropertyInput } from "@/server/directory";

export type AdminProperty = { id: string; slug: string; name: string; type: string; districtName: string; verified: boolean; verifiedAt: Date | null; isDemo: boolean; hasPin: boolean; domain: string | null; edit: PropertyInput & { id: string } };

/** Listed businesses for the Directory tab (pending requests are in their own tab). */
export async function listAdminProperties(q?: string): Promise<AdminProperty[]> {
  const rows = await prisma.property.findMany({
    where: { isActive: true, listingStatus: "APPROVED", ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { domain: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ verified: "desc" }, { name: "asc" }],
    take: 200,
    include: { district: { select: { name: true } } },
  });
  return rows.map((p) => ({
    id: p.id, slug: p.slug, name: p.name, type: p.type, districtName: p.district.name, verified: p.verified, verifiedAt: p.verifiedAt, isDemo: p.isDemo, hasPin: p.lat !== null && p.lng !== null, domain: p.domain,
    edit: { id: p.id, name: p.name, type: p.type, districtId: p.districtId, description: p.description ?? "", address: p.address ?? "", domain: p.domain ?? "", phone: p.phone ?? "", email: p.email ?? "", businessUpi: p.businessUpi ?? "", registrationNumber: p.registrationNumber ?? "", lat: p.lat ?? undefined, lng: p.lng ?? undefined, tags: p.tags },
  }));
}

export type ListingRequest = {
  id: string; name: string; type: string; districtName: string; description: string | null; address: string | null; domain: string | null; phone: string | null; email: string | null; businessUpi: string | null; registrationNumber: string | null;
  lat: number | null; lng: number | null; createdAt: Date; requester: string | null; document: { title: string; link: string | null; mimeType: string } | null; possibleMatches: string[];
};

/** Requests waiting for a decision, oldest first, with the attached document and anything listed that looks the same. */
export async function listListingRequests(): Promise<ListingRequest[]> {
  const rows = await prisma.property.findMany({ where: { listingStatus: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100, include: { district: { select: { name: true } } } });
  const requesters = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.requestedById).filter((x): x is string => !!x) } }, select: { id: true, name: true, displayName: true, email: true } });
  const docs = await prisma.evidence.findMany({ where: { id: { in: rows.map((r) => r.documentEvidenceId).filter((x): x is string => !!x) }, deletedAt: null }, select: { id: true, title: true, storageUrl: true, mimeType: true } });
  return Promise.all(
    rows.map(async (p) => {
      const u = requesters.find((x) => x.id === p.requestedById);
      const d = docs.find((x) => x.id === p.documentEvidenceId);
      const key = d ? keyFromRef(d.storageUrl) : null;
      const similar = await prisma.property.findMany({ where: { id: { not: p.id }, isActive: true, name: { contains: p.name.split(/\s+/)[0], mode: "insensitive" } }, take: 3, select: { name: true } });
      return {
        id: p.id, name: p.name, type: p.type, districtName: p.district.name, description: p.description, address: p.address, domain: p.domain, phone: p.phone, email: p.email, businessUpi: p.businessUpi, registrationNumber: p.registrationNumber,
        lat: p.lat, lng: p.lng, createdAt: p.createdAt,
        requester: u ? `${u.displayName ?? u.name ?? "Traveller"}${u.email ? ` (${u.email})` : ""}` : null,
        document: d ? { title: d.title, mimeType: d.mimeType, link: key && storageConfigured() ? await signedUrl(key, 3600).catch(() => null) : null } : null,
        possibleMatches: similar.map((s) => s.name),
      };
    }),
  );
}
