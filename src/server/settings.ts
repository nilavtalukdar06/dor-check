import { cache } from "react";
import { displayNameSchema, preferenceSchema, MB, REPORT_NOTIFICATION_TYPES, type PreferencePatch } from "@/lib/settings";
import { usagePeriodStart } from "@/lib/investigation";
import prisma from "@/lib/prisma";
import { getUsage } from "@/server/usage";

export const VOICE_SECONDS_METRIC = "voice_seconds";

/** The person's saved preferences, created with the defaults the first time. */
export const getPreferences = cache(async (userId: string) => prisma.userPreference.upsert({ where: { userId }, create: { userId }, update: {} }));

export type SaveResult = { ok: true } | { ok: false; error: string };

/** Save some preferences. Only known fields with valid values are written. */
export async function savePreferences(userId: string, patch: PreferencePatch): Promise<SaveResult> {
  const parsed = preferenceSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That value is not allowed." };
  const data = parsed.data;
  if (data.homeDistrictId && !(await prisma.district.findUnique({ where: { id: data.homeDistrictId }, select: { id: true } }))) return { ok: false, error: "Choose a district from the list." };
  await prisma.userPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return { ok: true };
}

export async function saveDisplayName(userId: string, name: string): Promise<SaveResult> {
  const parsed = displayNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name" };
  await prisma.user.update({ where: { id: userId }, data: { displayName: parsed.data } });
  return { ok: true };
}

/** Count read-aloud and transcription seconds against this month. */
export async function recordVoiceSeconds(userId: string, seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  if (!whole) return;
  const periodStart = usagePeriodStart(new Date());
  await prisma.usageRecord.upsert({
    where: { userId_metric_periodStart: { userId, metric: VOICE_SECONDS_METRIC, periodStart } },
    create: { userId, metric: VOICE_SECONDS_METRIC, periodStart, quantity: whole },
    update: { quantity: { increment: whole } },
  });
}

export type UsageSummary = {
  investigations: { used: number; limit: number | null };
  voiceMinutes: { used: number; limit: number | null };
  storageMb: { used: number; limit: number | null };
  planName: string;
  planTier: string;
};

/** This month's use against the plan, for the plan page. */
export async function getUsageSummary(userId: string, role: "TRAVELLER" | "MODERATOR" | "ADMIN"): Promise<UsageSummary> {
  const inv = await getUsage(userId, role);
  const [voice, bytes, sub, free] = await Promise.all([
    prisma.usageRecord.findUnique({ where: { userId_metric_periodStart: { userId, metric: VOICE_SECONDS_METRIC, periodStart: usagePeriodStart(new Date()) } } }),
    prisma.evidence.aggregate({ where: { ownerId: userId, deletedAt: null }, _sum: { sizeBytes: true } }),
    prisma.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "TRIALING"] } }, orderBy: { createdAt: "desc" }, include: { plan: true } }),
    prisma.plan.findUnique({ where: { tier: "FREE" } }),
  ]);
  const plan = sub?.plan ?? free;
  const staff = role !== "TRAVELLER";
  return {
    investigations: { used: inv.used, limit: inv.limit },
    voiceMinutes: { used: Math.round(Number(voice?.quantity ?? 0) / 60), limit: staff ? null : (plan?.voiceMinutesPerMonth ?? null) },
    storageMb: { used: Math.round(((bytes._sum.sizeBytes ?? 0) / MB) * 10) / 10, limit: staff ? null : (plan?.evidenceStorageMb ?? null) },
    planName: plan?.name ?? "Free",
    planTier: plan?.tier ?? "FREE",
  };
}

export async function getPlanPage(userId: string) {
  const [plans, invoices, sub] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.invoice.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 12, include: { plan: { select: { name: true } } } }),
    prisma.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "TRIALING"] } }, orderBy: { createdAt: "desc" }, include: { plan: { select: { tier: true } } } }),
  ]);
  return { plans, invoices, currentTier: sub?.plan.tier ?? "FREE" };
}

// ───────────────────────── Notifications ─────────────────────────

export type NotificationItem = { id: string; type: string; title: string; body: string | null; href: string | null; read: boolean; createdAt: string };

export async function listNotifications(userId: string, take = 20): Promise<{ unread: number; items: NotificationItem[] }> {
  const [unread, rows] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
  ]);
  return { unread, items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, href: n.href, read: !!n.readAt, createdAt: n.createdAt.toISOString() })) };
}

export async function markRead(userId: string, id: string) {
  await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

/** Unread updates about reports, for the Community badge. */
export const unreadReportUpdates = (userId: string) => prisma.notification.count({ where: { userId, readAt: null, type: { in: [...REPORT_NOTIFICATION_TYPES] } } });
