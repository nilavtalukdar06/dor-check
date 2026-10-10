"use client";

import { useRealtime } from "inngest/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { fetchPriceRunToken } from "@/app/(app)/price/realtime";
import { StepTimeline, type StepStatus, type TimelineStep } from "@/components/investigation/step-timeline";
import { LoadingState } from "@/components/shell/loading";
import { priceRunChannel, type PriceProgress } from "@/inngest/channels";
import type { RunStepView } from "@/server/price-check";

const fromDb: Record<RunStepView["status"], StepStatus> = {
  QUEUED: "waiting",
  RUNNING: "running",
  RETRYING: "retrying",
  COMPLETED: "done",
  FAILED: "failed",
  CANCELLED: "failed",
  SKIPPED: "done",
};

const fromLive: Record<PriceProgress["status"], StepStatus> = {
  running: "running",
  progress: "running",
  done: "done",
  skipped: "done",
  failed: "failed",
};

/** If a live message is missed (tab asleep, reconnect), the page re-reads the database. */
const FALLBACK_REFRESH_MS = 6000;

/**
 * Live timeline of a price check. Starts from what the database says, then layers on updates
 * pushed by the Inngest workflow through Inngest Realtime. When the workflow announces it has
 * finished, the route refreshes and the server renders the result.
 */
export function ResearchProgress({
  id,
  title,
  steps,
  failed,
}: {
  id: string;
  title: string;
  steps: RunStepView[];
  failed?: boolean;
}) {
  const router = useRouter();
  const { messages, connectionStatus } = useRealtime({
    channel: priceRunChannel(id),
    topics: ["progress", "finished"] as const,
    token: () => fetchPriceRunToken(id),
    enabled: !failed,
  });

  const progress = useMemo(
    () => messages.all.filter((m) => m.topic === "progress").map((m) => m.data as PriceProgress),
    [messages.all],
  );
  const finished = messages.all.some((m) => m.topic === "finished");

  useEffect(() => {
    if (finished) router.refresh();
  }, [finished, router]);

  useEffect(() => {
    if (failed) return;
    const timer = setInterval(() => router.refresh(), FALLBACK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [failed, router]);

  // Latest live state per step wins over what the page was rendered with.
  const live = new Map<string, PriceProgress>();
  for (const p of progress) if (p.status !== "progress" || !live.has(p.step)) live.set(p.step, p);
  const latestNote = [...progress].reverse().find((p) => p.message)?.message;
  const lastEventByStep = new Map(progress.map((p) => [p.step, p.message]));

  const timeline: TimelineStep[] = steps.map((s) => {
    const l = live.get(s.key);
    const status = l ? fromLive[l.status] : fromDb[s.status];
    const durationMs = l?.durationMs ?? (fromDb[s.status] === "done" ? s.durationMs : null);
    return {
      title: s.title,
      status,
      duration: durationMs ? `${(durationMs / 1000).toFixed(1)}s` : undefined,
      tools: s.tools,
      note: status === "waiting" ? undefined : (lastEventByStep.get(s.key as PriceProgress["step"]) ?? undefined),
    };
  });
  const done = timeline.filter((t) => t.status === "done").length;

  return (
    <section aria-label="Price check progress" className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{failed ? "This check could not finish" : "Checking the price"}</h2>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          Step {Math.min(done + 1, timeline.length)} of {timeline.length}
        </span>
      </div>
      {failed ? (
        <p className="text-sm text-muted-foreground">Something went wrong while checking. Please try again.</p>
      ) : (
        <LoadingState
          text={
            latestNote
              ? `${latestNote}…`
              : connectionStatus === "open"
                ? "Waiting for the first step…"
                : "Connecting to the live feed…"
          }
        />
      )}
      <StepTimeline steps={timeline} />
      <p className="text-xs text-muted-foreground">
        Runs as a durable background workflow: each step is retried on its own if it fails. We read public pages and keep only prices whose sentence we can find on the page. Research usually takes 10 to 40 seconds.
      </p>
    </section>
  );
}
