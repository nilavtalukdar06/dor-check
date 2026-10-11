import { inngest } from "../client";
import { reportSubmitted } from "../events";
import prisma from "@/lib/prisma";
import { notifyUsers } from "@/server/notify";
import { requestReportsReindex, runAutoCheck } from "@/server/reports";

/**
 * What happens after a report is saved: compare it with the others, tell the moderators it needs
 * review, and make it searchable. The report is already in the list; this adds the judgement.
 * Each step is retried on its own, and running it again changes nothing twice.
 */
export const processReport = inngest.createFunction(
  {
    id: "process-report",
    triggers: [reportSubmitted],
    retries: 3,
    concurrency: [{ key: "event.data.reportId", limit: 1 }],
    onFailure: async ({ event, error }) => {
      const id = (event.data.event.data as { reportId?: string }).reportId;
      console.warn("process-report failed", id, error.message);
    },
  },
  async ({ event, step }) => {
    const { reportId, reference } = event.data;

    const check = await step.run("auto-check", () => runAutoCheck(reportId));

    await step.run("notify-moderators", async () => {
      const already = await prisma.notification.count({ where: { type: { in: ["moderation_assigned", "report_status"] }, title: { startsWith: "New report" }, data: { path: ["reportId"], equals: reportId } } });
      if (already > 0) return { notified: 0 };
      const report = await prisma.report.findUnique({ where: { id: reportId }, select: { reporterId: true, summary: true } });
      const staff = await prisma.user.findMany({ where: { role: { in: ["MODERATOR", "ADMIN"] }, ...(report?.reporterId ? { id: { not: report.reporterId } } : {}) }, select: { id: true } });
      if (staff.length === 0) return { notified: 0 };
      await notifyUsers(
        staff.map((s) => ({
          userId: s.id,
          type: "moderation_assigned",
          title: `New report ${reference} needs review`,
          body: `${report?.summary ?? ""}${check.matches ? ` · ${check.summary.replace("Auto: ", "")}` : ""}`.slice(0, 200),
          href: "/moderation",
          data: { reportId, reference },
        })),
      );
      return { notified: staff.length };
    });

    await step.run("make-searchable", () => requestReportsReindex());
    return { reference, ...check };
  },
);
