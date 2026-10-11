import "server-only";

import { autoCheckLabel, comparePriority, reportPriority, type Priority } from "@/lib/moderation";
import prisma from "@/lib/prisma";
import { REPORT_CATEGORIES, REPORT_STATUSES, TRANSITIONS, type ReportStatusName } from "@/lib/reports";
import { spokenLanguageName } from "@/lib/voice";
import { audit } from "@/server/audit";
import { notifyUsers } from "@/server/notify";
import { moderateComment, publishFinding, publicName, type Actor } from "@/server/comments";
import { changeReportStatus, requestReportsReindex } from "@/server/reports";
import { getReportDetail, type ReportDetail } from "@/server/reports-view";
import type { Prisma } from "@/generated/prisma/client";

type Staff = Actor & { role: "MODERATOR" | "ADMIN" };
type Result = { ok: true } | { ok: false; error: string };

// ───────────────────────── Numbers ─────────────────────────

export type ModerationStats = { waiting: number; inReview: number; resolvedThisWeek: number; avgReviewMs: number | null; flaggedComments: number; listingRequests: number; pendingTariffs: number };

export async function getModerationStats(): Promise<ModerationStats> {
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const monthAgo = new Date(Date.now() - 30 * 86400_000);
  const live = { deletedAt: null };
  const [waiting, inReview, resolvedThisWeek, reviewed, flaggedComments, listingRequests, pendingTariffs] = await Promise.all([
    prisma.report.count({ where: { ...live, status: "NEW" } }),
    prisma.report.count({ where: { ...live, status: "UNDER_REVIEW" } }),
    prisma.report.count({ where: { ...live, resolvedAt: { gte: weekAgo } } }),
    prisma.report.findMany({ where: { ...live, firstReviewedAt: { gte: monthAgo } }, select: { createdAt: true, firstReviewedAt: true }, take: 500 }),
    prisma.comment.count({ where: { status: "FLAGGED", report: live } }),
    prisma.property.count({ where: { listingStatus: "PENDING" } }),
    prisma.tariffBenchmark.count({ where: { reviewStatus: "pending", isActive: true } }),
  ]);
  const spans = reviewed.map((r) => r.firstReviewedAt!.getTime() - r.createdAt.getTime()).filter((ms) => ms >= 0);
  return { waiting, inReview, resolvedThisWeek, avgReviewMs: spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null, flaggedComments, listingRequests, pendingTariffs };
}

// ───────────────────────── The queue ─────────────────────────

export type QueueFilters = { status?: ReportStatusName | "OPEN" | "ALL"; category?: string; district?: string; priority?: Priority; q?: string };
export type QueueRow = { id: string; reference: string; summary: string; category: string; districtName: string; createdAt: Date; status: ReportStatusName; hidden: boolean; autoCheck: string; priority: Priority };

const OPEN: ReportStatusName[] = ["NEW", "UNDER_REVIEW", "VERIFIED"];

/** Reports for review, most urgent first, then oldest first (first come, first served within a priority). */
export async function listQueue(f: QueueFilters = {}): Promise<QueueRow[]> {
  const status = f.status && f.status !== "OPEN" ? f.status : "OPEN";
  const where: Prisma.ReportWhereInput = {
    deletedAt: null,
    ...(status === "OPEN" ? { status: { in: OPEN } } : status === "ALL" ? {} : { status }),
    ...(f.category && (REPORT_CATEGORIES as readonly string[]).includes(f.category) ? { category: f.category as (typeof REPORT_CATEGORIES)[number] } : {}),
    ...(f.district ? { district: { slug: f.district } } : {}),
    ...(f.q ? { OR: [{ reference: { contains: f.q.trim(), mode: "insensitive" } }, { summary: { contains: f.q.trim(), mode: "insensitive" } }] } : {}),
  };
  const rows = await prisma.report.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true, reference: true, summary: true, category: true, kind: true, status: true, visibility: true, createdAt: true, amountInr: true, autoCheckedAt: true,
      district: { select: { name: true } },
      similar: { select: { reason: true } },
      identifiers: { select: { identifier: { select: { kind: true } } } },
    },
  });
  const out = rows.map((r): QueueRow => {
    const exact = r.similar.filter((s) => s.reason !== "similar_text").length;
    const fuzzy = r.similar.length - exact;
    const priority = reportPriority({ kind: r.kind, amountInr: r.amountInr, exactMatches: exact, similarMatches: fuzzy, hasPaymentId: r.identifiers.some((i) => i.identifier.kind === "UPI") });
    return { id: r.id, reference: r.reference, summary: r.summary, category: r.category, districtName: r.district.name, createdAt: r.createdAt, status: r.status, hidden: r.visibility === "HIDDEN", autoCheck: autoCheckLabel(r.similar.length, !!r.autoCheckedAt), priority };
  });
  return out.filter((r) => !f.priority || r.priority === f.priority).sort((a, b) => comparePriority(a.priority, b.priority) || a.createdAt.getTime() - b.createdAt.getTime());
}

export const isReportStatus = (v: unknown): v is ReportStatusName => (REPORT_STATUSES as readonly string[]).includes(v as string);

// ───────────────────────── The review drawer ─────────────────────────

export type ReviewView = ReportDetail & {
  summary: string;
  reporter: { name: string; email: string | null } | null;
  isAnonymous: boolean;
  identifiers: { kind: string; display: string }[];
  next: ReportStatusName[];
  findingsAll: { id: string; body: string; publishedAt: Date; retractedAt: Date | null }[];
  voice: { transcript: string; translated: string | null; language: string } | null;
  commentCount: number;
  flaggedCount: number;
};

/** Everything a moderator needs to decide on a report, unredacted. */
export async function getReview(staff: Staff, reference: string): Promise<ReviewView | null> {
  const detail = await getReportDetail({ id: staff.id, role: staff.role }, reference);
  if (!detail) return null;
  const r = await prisma.report.findUniqueOrThrow({
    where: { id: detail.id },
    select: {
      summary: true, isAnonymous: true,
      reporter: { select: { name: true, displayName: true, email: true } },
      identifiers: { select: { identifier: { select: { kind: true, display: true } } } },
      findings: { orderBy: { publishedAt: "desc" }, select: { id: true, body: true, publishedAt: true, retractedAt: true } },
      voiceJobs: { where: { kind: "STT", status: "COMPLETED" }, take: 1, select: { transcript: true, translated: true, detectedLanguage: true } },
      _count: { select: { comments: true } },
    },
  });
  const flaggedCount = await prisma.comment.count({ where: { reportId: detail.id, status: "FLAGGED" } });
  const v = r.voiceJobs[0];
  return {
    ...detail,
    summary: r.summary,
    reporter: r.reporter ? { name: r.reporter.displayName ?? r.reporter.name ?? "Traveller", email: r.reporter.email } : null,
    isAnonymous: r.isAnonymous,
    identifiers: r.identifiers.map((i) => ({ kind: i.identifier.kind, display: i.identifier.display })),
    next: [...TRANSITIONS[detail.status]],
    findingsAll: r.findings,
    voice: v?.transcript ? { transcript: v.transcript, translated: v.translated, language: spokenLanguageName(v.detectedLanguage) } : null,
    commentCount: r._count.comments,
    flaggedCount,
  };
}

// ───────────────────────── Decisions ─────────────────────────

/**
 * Move a report on, optionally with a note to the reporter and a published finding, as one
 * decision. Each part is recorded in the report's history, the moderation log and the audit log.
 */
export async function reviewReport(staff: Staff, reference: string, input: { to?: ReportStatusName; note?: string; finding?: string }): Promise<Result> {
  const report = await prisma.report.findFirst({ where: { reference, deletedAt: null }, select: { id: true, reference: true, reporterId: true, status: true } });
  if (!report) return { ok: false, error: "Report not found." };
  const note = input.note?.trim().slice(0, 500) || undefined;
  const finding = input.finding?.trim();

  // A finding first: a status like Verified should land with its explanation already visible.
  if (finding) {
    const f = await publishFinding(staff, report.reference, finding);
    if (!f.ok) return f;
    await audit(staff.id, "report.publish_finding", "Report", report.id, { findingId: f.id ?? null });
  }
  if (input.to && input.to !== report.status) {
    const moved = await changeReportStatus(report.id, staff, input.to, note);
    if (!moved.ok) return moved;
    await prisma.moderationAction.create({ data: { moderatorId: staff.id, targetType: "report", targetId: report.id, action: "status_change", note: note ?? null, before: { status: moved.from }, after: { status: moved.to } } });
    await audit(staff.id, "report.status_change", "Report", report.id, { from: moved.from, to: moved.to });
  }
  // A note with no status change still reaches the reporter.
  if (note && (!input.to || input.to === report.status)) {
    await prisma.reportEvent.create({ data: { reportId: report.id, type: "NOTE", actorId: staff.id, note } });
    if (report.reporterId) await notifyUsers([{ userId: report.reporterId, type: "report_status", title: `A moderator wrote about ${report.reference}`, body: note.slice(0, 200), href: `/reports/${report.reference}`, data: { reportId: report.id } }]);
    await prisma.moderationAction.create({ data: { moderatorId: staff.id, targetType: "report", targetId: report.id, action: "note", note } });
    await audit(staff.id, "report.note", "Report", report.id);
  }
  if (!finding && !input.to && !note) return { ok: false, error: "Choose a status, write a note or a finding." };
  return { ok: true };
}

/** Hide a report from the public (or show it again). The reporter and moderators still see it. */
export async function setReportHidden(staff: Staff, reference: string, hidden: boolean, note?: string): Promise<Result> {
  const report = await prisma.report.findFirst({ where: { reference, deletedAt: null }, select: { id: true, visibility: true } });
  if (!report) return { ok: false, error: "Report not found." };
  const to = hidden ? "HIDDEN" : "PUBLIC";
  if (report.visibility === to) return { ok: true };
  await prisma.report.update({ where: { id: report.id }, data: { visibility: to } });
  await prisma.reportEvent.create({ data: { reportId: report.id, type: hidden ? "HIDDEN" : "RESTORED", actorId: staff.id, note: note?.slice(0, 300) || null } });
  await prisma.moderationAction.create({ data: { moderatorId: staff.id, targetType: "report", targetId: report.id, action: hidden ? "hide" : "restore", note: note?.slice(0, 300) || null } });
  await audit(staff.id, hidden ? "report.hide" : "report.restore", "Report", report.id);
  // Hidden reports leave the knowledge base; restored ones come back.
  await requestReportsReindex(staff.id);
  return { ok: true };
}

// ───────────────────────── Flagged comments ─────────────────────────

export type FlaggedComment = { id: string; reference: string; author: string; body: string; reason: string | null; flaggedAt: Date | null; held: boolean; flaggedBy: string | null };

export async function listFlaggedComments(): Promise<FlaggedComment[]> {
  const rows = await prisma.comment.findMany({
    where: { status: "FLAGGED", report: { deletedAt: null } },
    orderBy: { flaggedAt: "asc" },
    take: 100,
    include: { author: { select: { name: true, displayName: true } }, report: { select: { reference: true, reporterId: true, isAnonymous: true } } },
  });
  const flaggers = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.flaggedById).filter((x): x is string => !!x) } }, select: { id: true, name: true, displayName: true } });
  return rows.map((c) => {
    const by = flaggers.find((u) => u.id === c.flaggedById);
    return {
      id: c.id,
      reference: c.report.reference,
      author: c.author ? publicName(c.author, { staff: c.authorRole !== "TRAVELLER", anonymousReporter: c.authorId === c.report.reporterId && c.report.isAnonymous }) : "Former member",
      body: c.body,
      reason: c.flaggedReason,
      flaggedAt: c.flaggedAt,
      held: !c.streamMessageId,
      flaggedBy: by ? (by.displayName ?? by.name ?? "Traveller") : c.flaggedById ? "Traveller" : "Automatic check",
    };
  });
}

export async function decideComment(staff: Staff, commentId: string, action: "approve" | "remove"): Promise<Result> {
  const r = await moderateComment(staff, commentId, action);
  if (r.ok) await audit(staff.id, action === "approve" ? "comment.approve" : "comment.remove", "Comment", commentId);
  return r;
}
