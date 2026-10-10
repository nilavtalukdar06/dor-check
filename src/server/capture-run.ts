import "server-only";

import { inngest } from "@/inngest/client";
import { captureRequested } from "@/inngest/events";
import prisma from "@/lib/prisma";
import { hostOf, isSafePublicUrl } from "@/lib/research-policy";
import { consumeRateLimit } from "@/server/rate-limit";
import { getPersonalWorkspace } from "@/server/users";

/** A capture that has been running longer than this is treated as stuck, not as in progress. */
const STUCK_AFTER_MS = 6 * 60 * 1000;
const CAPTURES_PER_HOUR = 10;

export type StartCapture = { ok: true; id: string } | { ok: false; error: string };

/** "example.com/x" -> "https://example.com/x". */
export const normalizeUrl = (raw: string) => {
  const t = raw.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

/**
 * Starts a durable capture of one page: creates the run and sends the Inngest event. Each
 * capture opens a paid remote browser, so it is rate limited and one runs at a time per person.
 */
export async function startCapture(user: { id: string }, rawUrl: string, via: string): Promise<StartCapture> {
  const url = normalizeUrl(rawUrl);
  if (rawUrl.trim().length === 0 || url.length > 2000 || !isSafePublicUrl(url)) {
    return { ok: false, error: "Enter a public http or https address." };
  }

  const busy = await prisma.investigation.findFirst({
    where: { userId: user.id, runCapture: true, status: "RUNNING", createdVia: via, createdAt: { gt: new Date(Date.now() - STUCK_AFTER_MS) } },
    select: { id: true },
  });
  if (busy) return { ok: false, error: "A capture is already running. Wait for it to finish." };

  if (!(await consumeRateLimit(`capture:${user.id}`, CAPTURES_PER_HOUR, 3600))) {
    return { ok: false, error: "You have started a lot of captures this hour. Try again later." };
  }

  const workspace = await getPersonalWorkspace(user.id);
  const host = hostOf(url);
  const inv = await prisma.investigation.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      kind: "BOOKING",
      inputType: "LINK",
      title: host,
      input: url,
      status: "RUNNING",
      runCapture: true,
      runResearch: false,
      runKnowledge: false,
      totalSteps: 1,
      startedAt: new Date(),
      createdVia: via,
      workflowRuns: {
        create: {
          runCode: `run_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          type: "capture",
          subject: host,
          status: "QUEUED",
          userId: user.id,
          stepsTotal: 1,
        },
      },
    },
    select: { id: true },
  });

  try {
    await inngest.send(captureRequested.create({ investigationId: inv.id }, { id: `capture-${inv.id}` }));
  } catch {
    await prisma.investigation.update({ where: { id: inv.id }, data: { status: "FAILED", error: "Worker unreachable" } });
    return { ok: false, error: "We could not start the capture right now. Please try again in a moment." };
  }
  return { ok: true, id: inv.id };
}
