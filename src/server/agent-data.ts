import { phoneVariants } from "@/lib/identifiers";
import prisma from "@/lib/prisma";

// Database lookups the agent's tools use. They match by identifier (domain, phone, UPI) and
// return what is needed to judge a seller, never contact details or who filed a report.

export type IdentifierQuery = { domains: string[]; phones: string[]; upis: string[] };
export type MatchedOn = "domain" | "phone" | "upi" | "name";

export type DirectoryMatch = {
  propertyId: string;
  slug: string;
  name: string;
  type: string;
  districtName: string;
  verified: boolean;
  domain: string | null;
  matchedOn: MatchedOn[];
};

export type ReportMatch = {
  id: string;
  reference: string;
  status: string;
  category: string;
  summary: string;
  districtName: string;
  matchedOn: MatchedOn[];
};

export type DirectoryData = {
  findByIdentifiers(q: IdentifierQuery): Promise<DirectoryMatch[]>;
  findByName(name: string): Promise<DirectoryMatch[]>;
  registeredDomains(): Promise<string[]>;
};
export type ReportData = { findByIdentifiers(q: IdentifierQuery): Promise<ReportMatch[]> };

const kindToMatch = { DOMAIN: "domain", PHONE: "phone", UPI: "upi", URL: "domain", EMAIL: "domain", NAME: "name" } as const;

function identifierWhere(q: IdentifierQuery) {
  const or = [
    ...(q.domains.length ? [{ kind: "DOMAIN" as const, value: { in: q.domains } }] : []),
    ...(q.phones.length ? [{ kind: "PHONE" as const, value: { in: q.phones.flatMap(phoneVariants) } }] : []),
    ...(q.upis.length ? [{ kind: "UPI" as const, value: { in: q.upis } }] : []),
  ];
  return or.length ? { OR: or } : null;
}

export const directoryData: DirectoryData = {
  async findByIdentifiers(q) {
    const where = identifierWhere(q);
    if (!where) return [];
    const rows = await prisma.identifier.findMany({
      where,
      select: { kind: true, properties: { select: { property: { select: { id: true, slug: true, name: true, type: true, verified: true, isActive: true, domain: true, district: { select: { name: true } } } } } } },
    });
    const byId = new Map<string, DirectoryMatch>();
    for (const row of rows) {
      for (const { property: p } of row.properties) {
        if (!p.isActive) continue;
        const m = byId.get(p.id) ?? { propertyId: p.id, slug: p.slug, name: p.name, type: p.type, districtName: p.district.name, verified: p.verified, domain: p.domain, matchedOn: [] };
        const on = kindToMatch[row.kind];
        if (!m.matchedOn.includes(on)) m.matchedOn.push(on);
        byId.set(p.id, m);
      }
    }
    return [...byId.values()];
  },

  async findByName(name) {
    const clean = name.trim().slice(0, 80);
    if (clean.length < 3) return [];
    const words = clean.split(/\s+/).filter((w) => w.length >= 4).slice(0, 4);
    const rows = await prisma.property.findMany({
      where: { isActive: true, OR: [{ name: { contains: clean, mode: "insensitive" } }, ...words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } }))] },
      select: { id: true, slug: true, name: true, type: true, verified: true, domain: true, district: { select: { name: true } } },
      take: 5,
    });
    return rows.map((p) => ({ propertyId: p.id, slug: p.slug, name: p.name, type: p.type, districtName: p.district.name, verified: p.verified, domain: p.domain, matchedOn: ["name" as const] }));
  },

  async registeredDomains() {
    const rows = await prisma.property.findMany({ where: { isActive: true, domain: { not: null } }, select: { domain: true } });
    return rows.map((r) => r.domain!).filter(Boolean);
  },
};

export const reportData: ReportData = {
  async findByIdentifiers(q) {
    const where = identifierWhere(q);
    if (!where) return [];
    const rows = await prisma.identifier.findMany({
      where,
      select: {
        kind: true,
        reports: {
          select: {
            report: {
              select: { id: true, reference: true, status: true, category: true, summary: true, deletedAt: true, visibility: true, hiddenReason: true, district: { select: { name: true } } },
            },
          },
        },
      },
    });
    const byId = new Map<string, ReportMatch>();
    for (const row of rows) {
      for (const { report: r } of row.reports) {
        // Same rule as the knowledge index: public, visible, not rejected.
        if (r.deletedAt || r.visibility !== "PUBLIC" || r.hiddenReason || r.status === "REJECTED") continue;
        const m = byId.get(r.id) ?? { id: r.id, reference: r.reference, status: r.status, category: r.category, summary: r.summary, districtName: r.district.name, matchedOn: [] };
        const on = kindToMatch[row.kind];
        if (!m.matchedOn.includes(on)) m.matchedOn.push(on);
        byId.set(r.id, m);
      }
    }
    return [...byId.values()];
  },
};
