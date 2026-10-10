import "server-only";

import { redactContacts } from "@/lib/knowledge";
import prisma from "@/lib/prisma";
import { hostOf } from "@/lib/research-policy";
import { ANY_REFERENCE_RE, REPORT_PAGE_SIZE, STATUS_LABEL, upcomingSteps, type ReportListParams, type ReportStatusName } from "@/lib/reports";
import { keyFromRef, signedUrl, storageConfigured } from "@/server/storage";
import type { Prisma } from "@/generated/prisma/client";

type Viewer = { id: string; role: "TRAVELLER" | "MODERATOR" | "ADMIN" };
const isStaff = (v: Viewer) => v.role !== "TRAVELLER";

// ───────────────────────── The list ─────────────────────────

export type ReportRow = { reference: string; summary: string; category: string; districtName: string; date: Date; status: ReportStatusName; mine: boolean };

/** Reports for the list page. Everyone sees public, non-rejected reports; "Mine" adds your own whatever their state. */
export async function listReports(viewer: Viewer, p: ReportListParams): Promise<{ rows: ReportRow[]; total: number; pages: number }> {
  const visible: Prisma.ReportWhereInput = { deletedAt: null, visibility: "PUBLIC", status: { not: "REJECTED" } };
  const base: Prisma.ReportWhereInput =
    p.tab === "mine" ? { deletedAt: null, reporterId: viewer.id } : p.tab === "following" ? { ...visible, followers: { some: { userId: viewer.id } } } : p.tab === "verified" ? { ...visible, status: "VERIFIED" } : visible;

  const where: Prisma.ReportWhereInput = {
    AND: [
      base,
      ...(p.category ? [{ category: p.category }] : []),
      ...(p.status ? [{ status: p.status }] : []),
      ...(p.district ? [{ district: { slug: p.district } }] : []),
      ...(p.q
        ? [{ OR: [{ reference: { contains: p.q, mode: "insensitive" as const } }, { summary: { contains: p.q, mode: "insensitive" as const } }, { locationText: { contains: p.q, mode: "insensitive" as const } }, { district: { name: { contains: p.q, mode: "insensitive" as const } } }] }]
        : []),
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p.page - 1) * REPORT_PAGE_SIZE, take: REPORT_PAGE_SIZE, select: { reference: true, summary: true, category: true, createdAt: true, incidentAt: true, status: true, reporterId: true, district: { select: { name: true } } } }),
  ]);
  return {
    total,
    pages: Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE)),
    rows: rows.map((r) => ({ reference: r.reference, summary: r.summary, category: r.category, districtName: r.district.name, date: r.incidentAt ?? r.createdAt, status: r.status, mine: r.reporterId === viewer.id })),
  };
}

export async function listDistrictsForFilter() {
  return prisma.district.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } });
}

// ───────────────────────── One report ─────────────────────────

export type HistoryItem = { key: string; label: string; note: string | null; at: Date | null; state: "done" | "upcoming" };

export type ReportDetail = {
  id: string;
  reference: string;
  kind: string;
  category: string;
  districtName: string;
  locationText: string | null;
  incidentAt: Date | null;
  createdAt: Date;
  status: ReportStatusName;
  hidden: boolean;
  /** The reporter's words. Contact details are hidden unless the viewer is the reporter or staff. */
  allegation: string;
  reportedUrl: string | null;
  amountInr: number | null;
  autoCheckSummary: string | null;
  history: HistoryItem[];
  findings: { id: string; body: string; publishedAt: Date }[];
  similar: { reference: string; summary: string; reason: string; score: number | null }[];
  attachments: { id: string; title: string; kind: string; link: string | null }[];
  attachmentCount: number;
  followers: number;
  following: boolean;
  isReporter: boolean;
  staff: boolean;
  /** The investigation this report was started from, only shown to the reporter. */
  investigationId: string | null;
};

const REASON_LABEL: Record<string, string> = { same_url: "Same web address", same_domain: "Same website", same_upi: "Same UPI id", same_phone: "Same phone number", similar_text: "Reads alike" };
export const reasonLabel = (r: string) => REASON_LABEL[r] ?? r;

/** One report for its page, or null if it does not exist or this person may not see it. */
export async function getReportDetail(viewer: Viewer, reference: string): Promise<ReportDetail | null> {
  if (!ANY_REFERENCE_RE.test(reference)) return null;
  const r = await prisma.report.findFirst({
    where: { reference, deletedAt: null },
    include: {
      district: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { role: true } } } },
      findings: { where: { retractedAt: null }, orderBy: { publishedAt: "desc" } },
      similar: { include: { similarReport: { select: { reference: true, summary: true, status: true, visibility: true, deletedAt: true } } } },
      evidence: { include: { evidence: true } },
      followers: { select: { userId: true } },
    },
  });
  if (!r) return null;
  const isReporter = r.reporterId === viewer.id;
  const staff = isStaff(viewer);
  const publiclyVisible = r.visibility === "PUBLIC" && r.status !== "REJECTED";
  if (!publiclyVisible && !isReporter && !staff) return null;

  const privileged = isReporter || staff;
  const done: HistoryItem[] = r.events
    .filter((e) => privileged || !["NOTE", "ASSIGNED", "HIDDEN", "RESTORED"].includes(e.type))
    .map((e) => ({
      key: e.id,
      label:
        e.type === "SUBMITTED" ? "Submitted"
        : e.type === "AUTO_CHECKED" ? "Auto-checked"
        : e.type === "STATUS_CHANGED" && e.toStatus ? STATUS_LABEL[e.toStatus]
        : e.type === "FINDING_PUBLISHED" ? "Official finding published"
        : e.type === "FINDING_RETRACTED" ? "Finding withdrawn"
        : e.type === "HIDDEN" ? "Hidden by a moderator"
        : e.type === "RESTORED" ? "Restored"
        : e.type === "ASSIGNED" ? "Assigned for review"
        : "Note",
      note: e.type === "AUTO_CHECKED" ? (e.note ? e.note.toLowerCase() : null) : e.type === "STATUS_CHANGED" ? e.note : null,
      at: e.createdAt,
      state: "done" as const,
    }));
  const upcoming: HistoryItem[] = upcomingSteps(r.status).map((s) => ({ key: `next-${s}`, label: STATUS_LABEL[s], note: null, at: null, state: "upcoming" }));

  // Attachments can show a reporter's private details, so only the reporter and moderators open them.
  const files = privileged
    ? await Promise.all(
        r.evidence.filter((x) => !x.evidence.deletedAt).map(async ({ evidence: e }) => {
          const key = keyFromRef(e.storageUrl);
          const link = key && storageConfigured() && e.mimeType.startsWith("image/") ? await signedUrl(key, 3600).catch(() => null) : null;
          return { id: e.id, title: e.title, kind: e.kind, link };
        }),
      )
    : [];

  return {
    id: r.id,
    reference: r.reference,
    kind: r.kind,
    category: r.category,
    districtName: r.district.name,
    locationText: r.locationText,
    incidentAt: r.incidentAt,
    createdAt: r.createdAt,
    status: r.status,
    hidden: r.visibility === "HIDDEN",
    allegation: privileged ? r.description : redactContacts(r.description),
    reportedUrl: r.reportedUrl ? (privileged ? r.reportedUrl : hostOf(r.reportedUrl) || null) : null,
    amountInr: r.amountInr,
    autoCheckSummary: r.autoCheckSummary,
    history: [...done, ...upcoming],
    findings: r.findings.map((f) => ({ id: f.id, body: f.body, publishedAt: f.publishedAt })),
    similar: r.similar
      .filter((s) => !s.similarReport.deletedAt && s.similarReport.visibility === "PUBLIC" && s.similarReport.status !== "REJECTED")
      .map((s) => ({ reference: s.similarReport.reference, summary: s.similarReport.summary, reason: s.reason, score: s.score })),
    attachments: files,
    attachmentCount: r.evidence.filter((x) => !x.evidence.deletedAt).length,
    followers: r.followers.length,
    following: r.followers.some((f) => f.userId === viewer.id),
    isReporter,
    staff,
    investigationId: isReporter ? r.investigationId : null,
  };
}

// ───────────────────────── The form ─────────────────────────

export type ReportFormOptions = {
  districts: { id: string; name: string }[];
  /** The reporter's own images in the vault, to attach. */
  evidence: { id: string; title: string; subject: string | null; thumbnail: string | null }[];
  /** Filled in when the report is started from an investigation's verdict. */
  prefill: { investigationId: string; summary: string; reportedUrl?: string; districtId?: string; category?: string; evidenceIds: string[] } | null;
};

export async function getReportFormOptions(userId: string, investigationId?: string): Promise<ReportFormOptions> {
  const [districts, evidence, inv] = await Promise.all([
    prisma.district.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.evidence.findMany({ where: { ownerId: userId, deletedAt: null, mimeType: { startsWith: "image/" } }, orderBy: { capturedAt: "desc" }, take: 24 }),
    investigationId
      ? prisma.investigation.findFirst({ where: { id: investigationId, userId, deletedAt: null }, include: { evidence: { where: { deletedAt: null }, select: { id: true } }, result: { select: { verdict: true } } } })
      : Promise.resolve(null),
  ]);
  const withLinks = await Promise.all(
    evidence.map(async (e) => {
      const key = keyFromRef(e.storageUrl);
      return { id: e.id, title: e.title, subject: e.subject, thumbnail: key && storageConfigured() ? await signedUrl(key, 3600).catch(() => null) : null };
    }),
  );
  return {
    districts,
    evidence: withLinks,
    prefill: inv
      ? {
          investigationId: inv.id,
          summary: inv.result?.verdict === "SUSPICIOUS" ? `Suspicious booking: ${inv.title}`.slice(0, 120) : `Problem with ${inv.title}`.slice(0, 120),
          reportedUrl: inv.inputType === "LINK" ? inv.input : undefined,
          districtId: inv.districtId ?? undefined,
          category: inv.serviceType ?? undefined,
          evidenceIds: inv.evidence.map((e) => e.id).filter((id) => withLinks.some((w) => w.id === id)),
        }
      : null,
  };
}
