import { INVESTIGATION_METRIC, usagePeriodStart } from "@/lib/investigation";
import prisma from "@/lib/prisma";

export type Usage = { used: number; limit: number | null; remaining: number | null; planName: string };

/** The plan's monthly allowance for a person who has no active subscription. */
const FALLBACK_LIMIT = 5;

/**
 * This month's investigations against the person's plan. `limit` is null for an unlimited plan.
 * Staff (moderators and admins) are not limited, so they can test without running out.
 */
export async function getUsage(userId: string, role?: "TRAVELLER" | "MODERATOR" | "ADMIN"): Promise<Usage> {
  const [record, sub, free] = await Promise.all([
    prisma.usageRecord.findUnique({ where: { userId_metric_periodStart: { userId, metric: INVESTIGATION_METRIC, periodStart: usagePeriodStart(new Date()) } } }),
    prisma.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "TRIALING"] } }, orderBy: { createdAt: "desc" }, include: { plan: true } }),
    prisma.plan.findUnique({ where: { tier: "FREE" } }),
  ]);
  const used = Number(record?.quantity ?? 0);
  const plan = sub?.plan ?? free;
  const limit = role && role !== "TRAVELLER" ? null : plan ? plan.investigationsPerMonth : FALLBACK_LIMIT;
  return { used, limit, remaining: limit === null ? null : Math.max(limit - used, 0), planName: plan?.name ?? "Free" };
}
