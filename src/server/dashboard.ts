import "server-only";

import prisma from "@/lib/prisma";
import { bandCopy } from "@/lib/price-present";
import type { PriceBand } from "@/lib/price";

export type DashboardStats = { investigations: number; suspicious: number; reportsFollowed: number; evidence: number };

/** The four numbers at the top of the dashboard, for this person. */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const live = { userId, deletedAt: null };
  const [investigations, suspicious, reportsFollowed, evidence] = await Promise.all([
    prisma.investigation.count({ where: live }),
    prisma.investigation.count({ where: { ...live, result: { verdict: "SUSPICIOUS" } } }),
    prisma.reportFollow.count({ where: { userId, report: { deletedAt: null } } }),
    prisma.evidence.count({ where: { ownerId: userId, deletedAt: null } }),
  ]);
  return { investigations, suspicious, reportsFollowed, evidence };
}

export type RecentRow = {
  id: string;
  kind: "BOOKING" | "PRICE";
  title: string;
  href: string;
  at: Date;
  /** Still working: shows the step it is on. */
  running: { stepsDone: number; totalSteps: number; latest: string | null } | null;
  badge: { label: string; tone: "ok" | "warning" | "danger" | "info" | "outline" } | null;
};

const VERDICT_BADGE: Record<string, RecentRow["badge"]> = {
  SUSPICIOUS: { label: "Suspicious", tone: "danger" },
  VERIFIED_MATCH: { label: "Verified match", tone: "ok" },
  NO_MATCH: { label: "No match found", tone: "outline" },
  INCONCLUSIVE: { label: "Inconclusive", tone: "warning" },
};

/** The person's latest checks (bookings and prices), newest first. */
export async function getRecentInvestigations(userId: string, take = 6): Promise<RecentRow[]> {
  const rows = await prisma.investigation.findMany({
    where: { userId, deletedAt: null, createdVia: { not: "assistant" } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      title: true,
      status: true,
      createdAt: true,
      totalSteps: true,
      runCapture: true,
      result: { select: { verdict: true } },
      priceCheck: { select: { band: true, basis: true } },
      workflowRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { stepsDone: true, events: { orderBy: { id: "desc" }, take: 1, select: { message: true } } } },
    },
  });
  return rows.map((r) => {
    const price = r.kind === "PRICE";
    const running = r.status === "RUNNING" || r.status === "QUEUED";
    const run = r.workflowRuns[0];
    let badge: RecentRow["badge"] = null;
    if (r.status === "FAILED") badge = { label: "Could not finish", tone: "warning" };
    else if (r.status === "CANCELLED") badge = { label: "Stopped", tone: "outline" };
    else if (price && r.priceCheck) {
      const copy = bandCopy(r.priceCheck.band as PriceBand, (r.priceCheck.basis as "curated" | "researched" | "estimated" | null) ?? null);
      badge = { label: copy.title, tone: copy.tone };
    } else if (r.result) badge = VERDICT_BADGE[r.result.verdict] ?? null;
    else if (r.status === "COMPLETED" && r.runCapture && !price) badge = { label: "Page captured", tone: "info" };
    return {
      id: r.id,
      kind: price ? "PRICE" : "BOOKING",
      title: r.title,
      href: price ? `/price?check=${r.id}` : r.status === "COMPLETED" && r.result ? `/investigate/${r.id}/verdict` : `/investigate/${r.id}`,
      at: r.createdAt,
      running: running ? { stepsDone: run?.stepsDone ?? 0, totalSteps: r.totalSteps, latest: run?.events[0]?.message ?? null } : null,
      badge,
    };
  });
}

export type AdvisoryRow = { id: string; title: string; label: string; date: Date; href: string | null };

/** Current advisories for the region: pinned first, then newest. */
export async function getAdvisories(take = 4): Promise<AdvisoryRow[]> {
  const now = new Date();
  const rows = await prisma.advisory.findMany({
    where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take,
    select: { id: true, title: true, label: true, publishedAt: true, sourceUrl: true },
  });
  return rows.map((a) => ({ id: a.id, title: a.title, label: a.label, date: a.publishedAt, href: a.sourceUrl }));
}

/** The demo notice, if the seed switched it on. */
export async function getDemoNotice(): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key: "demo_banner" } });
  const v = s?.value as { enabled?: boolean; text?: string } | null;
  return v?.enabled ? (v.text ?? "Demo build. All records are synthetic examples.") : null;
}
