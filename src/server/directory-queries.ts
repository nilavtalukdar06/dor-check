import { serviceTypeFor, type DirectoryParams } from "@/lib/directory";
import prisma from "@/lib/prisma";

const PAGE_SIZE = 48;

export type DirectoryItem = {
  id: string;
  slug: string;
  name: string;
  type: string;
  districtName: string;
  verified: boolean;
};

/** Directory cards for the filters in the URL. Verified places come first. */
export async function listProperties(params: Pick<DirectoryParams, "type" | "q" | "verified">) {
  const type = serviceTypeFor(params.type);
  const where = {
    isActive: true,
    ...(type ? { type } : {}),
    ...(params.verified ? { verified: true } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" as const } },
            { domain: { contains: params.q, mode: "insensitive" as const } },
            { district: { name: { contains: params.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      orderBy: [{ verified: "desc" }, { name: "asc" }],
      take: PAGE_SIZE,
      select: { id: true, slug: true, name: true, type: true, verified: true, district: { select: { name: true } } },
    }),
    prisma.property.count({ where }),
  ]);
  const items: DirectoryItem[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
    districtName: r.district.name,
    verified: r.verified,
  }));
  return { items, total, pageSize: PAGE_SIZE };
}

export type PropertyDetail = {
  id: string;
  slug: string;
  name: string;
  type: string;
  districtName: string;
  stateName: string;
  verified: boolean;
  verifiedAt: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  domain: string | null;
  businessUpi: string | null;
  registrationNumber: string | null;
  tags: string[];
  reports: { reference: string; summary: string; status: string; createdAt: string }[];
  reportCount: number;
};

/**
 * One property for the drawer. Only business contact details are shown (they are registered
 * to the business); reports are the public ones, with their summary only.
 */
export async function getPropertyDetail(slug: string): Promise<PropertyDetail | null> {
  const p = await prisma.property.findFirst({
    where: { slug, isActive: true },
    include: {
      district: { select: { name: true, stateCode: true } },
      reports: {
        where: { visibility: "PUBLIC", deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { reference: true, summary: true, status: true, createdAt: true },
      },
      _count: { select: { reports: { where: { visibility: "PUBLIC", deletedAt: null } } } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    districtName: p.district.name,
    stateName: p.district.stateCode === "AS" ? "Assam" : "Meghalaya",
    verified: p.verified,
    verifiedAt: p.verifiedAt?.toISOString() ?? null,
    description: p.description,
    address: p.address,
    phone: p.phone,
    email: p.email,
    domain: p.domain,
    businessUpi: p.businessUpi,
    registrationNumber: p.registrationNumber,
    tags: p.tags,
    reports: p.reports.map((r) => ({ reference: r.reference, summary: r.summary, status: r.status, createdAt: r.createdAt.toISOString() })),
    reportCount: p._count.reports,
  };
}
