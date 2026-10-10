import Browserbase from "@browserbasehq/sdk";
import { env } from "@/lib/env";
import prisma from "@/lib/prisma";

export type LiveView = { live: false; reason: "not_running" | "no_session" | "unavailable" } | { live: true; url: string };

/**
 * A read-only view of the remote browser for a running investigation. Live view links are
 * tied to the session and only work while it runs, so they are made on request and never
 * stored. Only the investigation's owner gets one.
 */
export async function getLiveView(investigationId: string, userId: string): Promise<LiveView | null> {
  const inv = await prisma.investigation.findFirst({
    where: { id: investigationId, userId },
    select: {
      status: true,
      workflowRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, browserSessionId: true } },
    },
  });
  if (!inv) return null;
  const run = inv.workflowRuns[0];
  if (!run || run.status !== "RUNNING") return { live: false, reason: "not_running" };
  if (!run.browserSessionId) return { live: false, reason: "no_session" };
  if (!env.BROWSERBASE_API_KEY) return { live: false, reason: "unavailable" };

  try {
    const bb = new Browserbase({ apiKey: env.BROWSERBASE_API_KEY });
    const debug = await bb.sessions.debug(run.browserSessionId);
    const raw = debug.pages?.[0]?.debuggerFullscreenUrl ?? debug.debuggerFullscreenUrl;
    if (!raw) return { live: false, reason: "unavailable" };
    // Hide Browserbase's own toolbar: this is a preview, not a control panel.
    return { live: true, url: `${raw}${raw.includes("?") ? "&" : "?"}navbar=false` };
  } catch {
    return { live: false, reason: "unavailable" };
  }
}
