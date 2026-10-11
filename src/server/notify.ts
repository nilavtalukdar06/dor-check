import prisma from "@/lib/prisma";
import { NOTIFICATION_GROUP } from "@/lib/settings";
import type { Prisma } from "@/generated/prisma/client";

type Row = Omit<Prisma.NotificationCreateManyInput, "readAt" | "createdAt" | "id">;

/**
 * Create in-app notifications, leaving out anyone who switched that kind off in Settings. Types
 * with no switch (system messages, listing decisions) are always delivered.
 */
export async function notifyUsers(rows: Row[]) {
  if (!rows.length) return 0;
  const groups = [...new Set(rows.map((r) => NOTIFICATION_GROUP[r.type]).filter((g): g is NonNullable<typeof g> => !!g))];
  let off = new Map<string, Set<string>>();
  if (groups.length) {
    const prefs = await prisma.userPreference.findMany({ where: { userId: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { userId: true, notifyRunAlerts: true, notifyReportUpdates: true, notifyModeration: true } });
    off = new Map(prefs.map((p) => [p.userId, new Set(groups.filter((g) => p[g] === false))]));
  }
  const keep = rows.filter((r) => {
    const g = NOTIFICATION_GROUP[r.type];
    return !g || !off.get(r.userId)?.has(g);
  });
  if (keep.length) await prisma.notification.createMany({ data: keep });
  return keep.length;
}
