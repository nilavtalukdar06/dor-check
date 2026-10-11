import prisma from "@/lib/prisma";
import { COMMENT_RATE, FINDING_MAX, isHeld, screenComment, type CommentStatusName } from "@/lib/comments";
import { ANY_REFERENCE_RE } from "@/lib/reports";
import { notifyUsers } from "@/server/notify";
import { consumeRateLimit } from "@/server/rate-limit";
import { ensureReportChannel, joinChannel, streamServer, upsertStreamUser } from "@/server/stream";

export type Actor = { id: string; role: "TRAVELLER" | "MODERATOR" | "ADMIN"; name?: string | null; displayName?: string | null };
const isStaff = (a: { role: Actor["role"] }) => a.role !== "TRAVELLER";

// ───────────────────────── Who may see a discussion ─────────────────────────

/** The report, if this person may see it (same rule as the report page); otherwise null. */
export async function findViewableReport(viewer: Pick<Actor, "id" | "role">, reference: string) {
  if (!ANY_REFERENCE_RE.test(reference)) return null;
  const r = await prisma.report.findFirst({
    where: { reference, deletedAt: null },
    select: { id: true, reference: true, status: true, visibility: true, reporterId: true, isAnonymous: true, streamChannelId: true },
  });
  if (!r) return null;
  const open = r.visibility === "PUBLIC" && r.status !== "REJECTED";
  if (!open && r.reporterId !== viewer.id && !isStaff(viewer)) return null;
  return { ...r, channelId: r.streamChannelId ?? `report-${r.reference}` };
}

/** The name shown beside a comment. Never an email, never a full name; the anonymous reporter is just "Reporter". */
export function publicName(user: { name: string | null; displayName: string | null }, opts: { staff: boolean; anonymousReporter: boolean }) {
  if (opts.staff) return "Moderation team";
  if (opts.anonymousReporter) return "Reporter";
  const first = (user.displayName ?? user.name ?? "").trim().split(/\s+/)[0];
  return first || "Traveller";
}

// ───────────────────────── Reading ─────────────────────────

export type CommentView = {
  id: string;
  author: string;
  badge: "Traveller" | "Official";
  body: string;
  createdAt: string;
  /** visible | flagged (shown, under review) | held (only you and moderators see it) | removed (moderators only). */
  state: "visible" | "flagged" | "held" | "removed";
  mine: boolean;
  /** The reporter's own comments are marked, so replies make sense. */
  reporter: boolean;
};

export async function listComments(viewer: Actor, report: { id: string; reporterId: string | null; isAnonymous: boolean }): Promise<CommentView[]> {
  const staff = isStaff(viewer);
  const rows = await prisma.comment.findMany({
    where: { reportId: report.id },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: { author: { select: { name: true, displayName: true } } },
  });
  const out: CommentView[] = [];
  for (const c of rows) {
    const status = c.status as CommentStatusName;
    const held = isHeld({ status, streamMessageId: c.streamMessageId });
    const mine = c.authorId === viewer.id;
    if (status === "REMOVED" && !staff) continue;
    if (held && !staff && !mine) continue;
    const reporter = !!report.reporterId && c.authorId === report.reporterId;
    out.push({
      id: c.id,
      author: c.author ? publicName(c.author, { staff: c.authorRole !== "TRAVELLER", anonymousReporter: reporter && report.isAnonymous }) : "Former member",
      badge: c.authorRole === "TRAVELLER" ? "Traveller" : "Official",
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      state: status === "REMOVED" ? "removed" : held ? "held" : status === "FLAGGED" ? "flagged" : "visible",
      mine,
      reporter,
    });
  }
  return out;
}

// ───────────────────────── Posting ─────────────────────────

export type PostResult = { ok: true; comment: CommentView; heldReason?: string } | { ok: false; error: string };

/** What a Stream message carries so any client can draw it without another lookup. */
const messageFields = (c: { id: string; authorRole: string }, author: string, reporter: boolean) => ({ comment_id: c.id, author_name: author, badge: c.authorRole === "TRAVELLER" ? "Traveller" : "Official", reporter });

async function sendToStream(report: { channelId: string; reference: string }, user: Actor, c: { id: string; body: string; authorRole: string }, author: string, reporter: boolean) {
  await upsertStreamUser(user.id, author);
  const channel = await ensureReportChannel(report.channelId, report.reference);
  await channel.sendMessage({ id: c.id, text: c.body, user_id: user.id, ...messageFields(c, author, reporter) } as never, { skip_push: true });
}

/**
 * Post a comment. Screening runs first; a clean comment is saved and sent to the chat, a
 * doubtful one is saved and held for a moderator, a bad one is turned back with a reason.
 */
export async function postComment(user: Actor, reference: string, rawBody: string): Promise<PostResult> {
  const report = await findViewableReport(user, reference);
  if (!report) return { ok: false, error: "This report is not available." };
  if (report.status === "REJECTED" || report.status === "CLOSED") return { ok: false, error: "The discussion on this report is closed." };

  const screened = screenComment(rawBody);
  if (screened.verdict === "reject") return { ok: false, error: screened.error };
  if (!(await consumeRateLimit(`comment:${user.id}`, COMMENT_RATE.limit, COMMENT_RATE.windowSeconds))) return { ok: false, error: "You're commenting very fast. Wait a few minutes and try again." };

  const staff = isStaff(user);
  const reporter = report.reporterId === user.id;
  const author = publicName({ name: user.name ?? null, displayName: user.displayName ?? null }, { staff, anonymousReporter: reporter && report.isAnonymous });
  const held = screened.verdict === "hold";
  const row = await prisma.comment.create({
    data: {
      reportId: report.id,
      authorId: user.id,
      authorRole: user.role,
      body: screened.body,
      status: held ? "FLAGGED" : "VISIBLE",
      flaggedReason: held ? screened.reason : null,
      flaggedAt: held ? new Date() : null,
    },
  });

  if (!held) {
    try {
      await sendToStream(report, user, row, author, reporter);
      await prisma.comment.update({ where: { id: row.id }, data: { streamMessageId: row.id } });
    } catch (e) {
      // Not delivered: do not leave a comment nobody can see.
      await prisma.comment.delete({ where: { id: row.id } }).catch(() => undefined);
      console.error("comment: stream send failed", e instanceof Error ? e.message : e);
      return { ok: false, error: "We couldn't post that just now. Please try again." };
    }
    await notifyAboutComment(report, user.id, author, screened.body);
  }

  return {
    ok: true,
    heldReason: held ? screened.reason : undefined,
    comment: { id: row.id, author, badge: user.role === "TRAVELLER" ? "Traveller" : "Official", body: screened.body, createdAt: row.createdAt.toISOString(), state: held ? "held" : "visible", mine: true, reporter },
  };
}

/** Tell the people following the report (and its reporter) about a new comment. */
async function notifyAboutComment(report: { id: string; reference: string; reporterId: string | null }, authorId: string, author: string, body: string) {
  const followers = await prisma.reportFollow.findMany({ where: { reportId: report.id, userId: { not: authorId } }, select: { userId: true } });
  const ids = new Set(followers.map((f) => f.userId));
  if (report.reporterId && report.reporterId !== authorId) ids.add(report.reporterId);
  if (!ids.size) return;
  await notifyUsers([...ids].map((userId) => ({ userId, type: "report_comment", title: `New comment on ${report.reference}`, body: `${author}: ${body.slice(0, 140)}`, href: `/reports/${report.reference}`, data: { reportId: report.id } })));
}

// ───────────────────────── Flagging and moderating ─────────────────────────

type SimpleResult = { ok: true } | { ok: false; error: string };

async function loadComment(id: string) {
  return prisma.comment.findUnique({ where: { id }, include: { report: { select: { id: true, reference: true, reporterId: true, isAnonymous: true, status: true, visibility: true, streamChannelId: true } }, author: { select: { name: true, displayName: true } } } });
}

/** Anyone who can see the report can flag someone else's comment for a moderator. It stays visible, marked, until reviewed. */
export async function flagComment(user: Actor, commentId: string, reason: string): Promise<SimpleResult> {
  const c = await loadComment(commentId);
  if (!c) return { ok: false, error: "Comment not found." };
  if (!(await findViewableReport(user, c.report.reference))) return { ok: false, error: "Comment not found." };
  if (c.authorId === user.id) return { ok: false, error: "You can't flag your own comment." };
  if (c.status === "REMOVED") return { ok: false, error: "That comment was already removed." };
  if (c.status === "FLAGGED") return { ok: true };
  if (!(await consumeRateLimit(`flag:${user.id}`, 20, 3600))) return { ok: false, error: "Too many flags. Try again later." };

  const moved = await prisma.comment.updateMany({ where: { id: c.id, status: "VISIBLE" }, data: { status: "FLAGGED", flaggedReason: reason.trim().slice(0, 120) || "Other", flaggedAt: new Date(), flaggedById: user.id } });
  if (moved.count === 0) return { ok: true };
  if (c.streamMessageId) {
    const client = streamServer();
    await client.flagMessage(c.streamMessageId, { user_id: user.id, reason: reason.slice(0, 120) }).catch(() => undefined);
    await client.partialUpdateMessage(c.streamMessageId, { set: { flagged: true } } as never, user.id).catch(() => undefined);
  }
  return { ok: true };
}

/**
 * Moderators decide a flagged or held comment. approve: show it (held ones are posted now).
 * remove: take it down for everyone. Every decision is written to the moderation log.
 */
export async function moderateComment(actor: Actor, commentId: string, action: "approve" | "remove", note?: string): Promise<SimpleResult> {
  if (!isStaff(actor)) return { ok: false, error: "Only moderators can do that." };
  const c = await loadComment(commentId);
  if (!c) return { ok: false, error: "Comment not found." };
  const before = c.status as CommentStatusName;
  const held = isHeld({ status: before, streamMessageId: c.streamMessageId });
  const now = new Date();

  if (action === "approve") {
    if (before === "REMOVED") return { ok: false, error: "A removed comment can't be approved." };
    if (before === "VISIBLE") return { ok: true };
    if (held) {
      const staffAuthor = c.authorRole !== "TRAVELLER";
      const reporter = !!c.report.reporterId && c.authorId === c.report.reporterId;
      const author = c.author ? publicName(c.author, { staff: staffAuthor, anonymousReporter: reporter && c.report.isAnonymous }) : "Former member";
      try {
        await sendToStream({ channelId: c.report.streamChannelId ?? `report-${c.report.reference}`, reference: c.report.reference }, { id: c.authorId ?? actor.id, role: c.authorRole }, { id: c.id, body: c.body, authorRole: c.authorRole }, author, reporter);
      } catch (e) {
        console.error("comment: stream send failed", e instanceof Error ? e.message : e);
        return { ok: false, error: "Couldn't post it to the discussion. Try again." };
      }
      await notifyAboutComment({ id: c.report.id, reference: c.report.reference, reporterId: c.report.reporterId }, c.authorId ?? "", author, c.body);
    } else if (c.streamMessageId) {
      await streamServer().partialUpdateMessage(c.streamMessageId, { set: { flagged: false } } as never, c.authorId ?? undefined).catch(() => undefined);
    }
    await prisma.comment.update({ where: { id: c.id }, data: { status: "VISIBLE", streamMessageId: held ? c.id : c.streamMessageId, flaggedReason: null, flaggedAt: null, flaggedById: null, moderatedById: actor.id, moderatedAt: now } });
  } else {
    if (before === "REMOVED") return { ok: true };
    if (c.streamMessageId) await streamServer().deleteMessage(c.streamMessageId).catch((e) => console.error("comment: stream delete failed", e instanceof Error ? e.message : e));
    await prisma.comment.update({ where: { id: c.id }, data: { status: "REMOVED", moderatedById: actor.id, moderatedAt: now } });
  }

  await prisma.moderationAction.create({ data: { moderatorId: actor.id, targetType: "comment", targetId: c.id, action: action === "approve" ? "restore" : "hide", note: note?.slice(0, 300) || null, before: { status: before }, after: { status: action === "approve" ? "VISIBLE" : "REMOVED" } } });
  return { ok: true };
}

// ───────────────────────── Official findings ─────────────────────────

/** Publish an official finding. It lives in our database and is drawn above the discussion, never inside it. */
export async function publishFinding(actor: Actor, reference: string, body: string): Promise<SimpleResult & { id?: string }> {
  if (!isStaff(actor)) return { ok: false, error: "Only moderators can publish a finding." };
  const text = body.replace(/\r\n/g, "\n").trim();
  if (text.length < 20) return { ok: false, error: "Write at least a couple of sentences so readers know what was checked." };
  if (text.length > FINDING_MAX) return { ok: false, error: `Keep it under ${FINDING_MAX} characters.` };
  const report = await prisma.report.findFirst({ where: { reference, deletedAt: null }, select: { id: true, reference: true, status: true } });
  if (!report) return { ok: false, error: "Report not found." };

  const finding = await prisma.officialFinding.create({ data: { reportId: report.id, authorId: actor.id, body: text } });
  await prisma.reportEvent.create({ data: { reportId: report.id, type: "FINDING_PUBLISHED", actorId: actor.id, note: text.slice(0, 200), data: { findingId: finding.id } } });
  await prisma.moderationAction.create({ data: { moderatorId: actor.id, targetType: "report", targetId: report.id, action: "publish_finding", note: text.slice(0, 300), after: { findingId: finding.id } } });
  const followers = await prisma.reportFollow.findMany({ where: { reportId: report.id, userId: { not: actor.id } }, select: { userId: true } });
  if (followers.length) {
    await notifyUsers(followers.map((f) => ({ userId: f.userId, type: "report_finding", title: `Official finding on ${report.reference}`, body: text.slice(0, 200), href: `/reports/${report.reference}`, data: { reportId: report.id, findingId: finding.id } })));
  }
  return { ok: true, id: finding.id };
}

/** Withdraw a finding. It disappears from the page; the record and who withdrew it stay. */
export async function retractFinding(actor: Actor, findingId: string, note?: string): Promise<SimpleResult> {
  if (!isStaff(actor)) return { ok: false, error: "Only moderators can withdraw a finding." };
  const f = await prisma.officialFinding.findUnique({ where: { id: findingId }, select: { id: true, reportId: true, retractedAt: true } });
  if (!f) return { ok: false, error: "Finding not found." };
  if (f.retractedAt) return { ok: true };
  const moved = await prisma.officialFinding.updateMany({ where: { id: f.id, retractedAt: null }, data: { retractedAt: new Date(), retractedById: actor.id } });
  if (moved.count === 0) return { ok: true };
  await prisma.reportEvent.create({ data: { reportId: f.reportId, type: "FINDING_RETRACTED", actorId: actor.id, note: note?.slice(0, 200) || null, data: { findingId: f.id } } });
  await prisma.moderationAction.create({ data: { moderatorId: actor.id, targetType: "report", targetId: f.reportId, action: "edit", note: note?.slice(0, 300) || "Finding withdrawn", before: { findingId: f.id, retracted: false }, after: { retracted: true } } });
  return { ok: true };
}

// ───────────────────────── Stream webhook ─────────────────────────

/**
 * message.new from Stream: make sure the database has it. Our own posts are already saved
 * (same id), so this only matters as a safety net for anything that reached the chat another way.
 */
export async function mirrorStreamMessage(event: { type: string; message?: { id: string; text?: string; user?: { id: string } }; channel_id?: string; channel_type?: string }) {
  if (event.type !== "message.new" || !event.message || event.channel_type !== "report" || !event.channel_id) return { mirrored: false as const, reason: "ignored" };
  const m = event.message;
  if (m.user?.id === "ttd-system") return { mirrored: false as const, reason: "system" };
  const existing = await prisma.comment.findFirst({ where: { OR: [{ id: m.id }, { streamMessageId: m.id }] }, select: { id: true } });
  if (existing) return { mirrored: false as const, reason: "known" };
  const report = await prisma.report.findFirst({ where: { OR: [{ streamChannelId: event.channel_id }, { reference: event.channel_id.replace(/^report-/, "") }] }, select: { id: true } });
  if (!report) return { mirrored: false as const, reason: "no-report" };
  const author = m.user?.id ? await prisma.user.findUnique({ where: { id: m.user.id }, select: { id: true, role: true } }) : null;
  const body = (m.text ?? "").slice(0, 1000);
  if (!body) return { mirrored: false as const, reason: "empty" };
  await prisma.comment.create({ data: { id: m.id, reportId: report.id, authorId: author?.id ?? null, authorRole: author?.role ?? "TRAVELLER", body, streamMessageId: m.id, status: "FLAGGED", flaggedReason: "Arrived outside the app", flaggedAt: new Date() } });
  return { mirrored: true as const };
}

export { joinChannel };
