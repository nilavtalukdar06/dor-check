"use client";

import { useRealtime } from "inngest/react";
import { CheckCircle2Icon, CircleAlertIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { fetchCaptureRunToken } from "@/app/(app)/evidence/realtime";
import { LiveBrowser } from "@/components/investigation/live-browser";
import { LoadingState } from "@/components/shell/loading";
import { Button } from "@/components/ui/button";
import { captureRunChannel, type CaptureLiveEvent } from "@/inngest/channels";
import { evidenceHref, type EvidenceParams } from "@/lib/evidence";
import type { CaptureRunView } from "@/server/capture-view";

/** If a live message is missed (tab asleep, reconnect), the page re-reads the database. */
const FALLBACK_REFRESH_MS = 6000;

const clock = (ms: number) =>
  new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(ms);

/**
 * A capture in progress: the remote browser live, the action it is on right now, and the
 * timeline. Starts from what the database says, then layers on updates pushed by the Inngest
 * workflow through Inngest Realtime. When the workflow announces it has finished, the route
 * refreshes so the vault grid below shows the new items.
 */
export function CapturePanel({ run, params }: { run: CaptureRunView; params: Pick<EvidenceParams, "type" | "q"> }) {
  const router = useRouter();
  const running = run.status === "RUNNING";

  const { messages, connectionStatus } = useRealtime({
    channel: captureRunChannel(run.id),
    topics: ["event", "finished"] as const,
    token: () => fetchCaptureRunToken(run.id),
    enabled: running,
  });

  const finished = messages.all.some((m) => m.topic === "finished");
  useEffect(() => {
    if (finished) router.refresh();
  }, [finished, router]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), FALLBACK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [running, router]);

  // What the database already has, plus anything pushed live that it does not have yet.
  const events = useMemo(() => {
    const seen = new Set(run.events.map((e) => `${e.type}|${e.message}`));
    const live = messages.all
      .filter((m) => m.topic === "event")
      .map((m) => m.data as CaptureLiveEvent)
      .filter((e) => !seen.has(`${e.type}|${e.message}`));
    return [...run.events, ...live];
  }, [run.events, messages.all]);
  const current = [...events].reverse().find((e) => !e.type.startsWith("capture_"))?.message;

  const closeHref = evidenceHref({ type: params.type, q: params.q });
  const shot = run.screenshot;

  return (
    <section aria-label="Page capture" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs" data-testid="capture-panel" data-status={run.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {running ? "Capturing a page" : run.status === "COMPLETED" ? "Capture complete" : "The capture could not finish"}
          </h2>
          <p className="truncate text-sm text-muted-foreground">{run.url}</p>
        </div>
        {!running ? (
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={closeHref} replace scroll={false} aria-label="Dismiss" />}>
            <XIcon />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          {running ? (
            <>
              <LiveBrowser investigationId={run.id} host={run.host} onDisconnected={() => router.refresh()} />
              <LoadingState
                text={current ? `${current}…` : connectionStatus === "open" ? "Waiting for the browser…" : "Connecting to the live feed…"}
              />
            </>
          ) : shot?.link ? (
            <figure className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot.link} alt={`Screenshot of ${run.host}`} className="w-full rounded-lg border bg-muted" />
              <figcaption className="font-mono text-xs text-muted-foreground">
                Captured at {clock(new Date(shot.capturedAt).getTime())} IST
                {shot.width && shot.height ? ` · ${shot.width} × ${shot.height}` : ""}
              </figcaption>
            </figure>
          ) : run.status === "FAILED" ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-soft p-3 text-sm text-danger">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{run.error ?? "Something went wrong while capturing the page."}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">What the browser did</h3>
          <ol className="flex flex-col gap-2" aria-label="Capture timeline">
            {events.length === 0 ? <li className="text-sm text-muted-foreground">Nothing yet.</li> : null}
            {events.map((e, i) => {
              const last = i === events.length - 1;
              const failed = e.type.endsWith("_failed");
              return (
                <li key={`${e.type}-${i}`} className="flex items-start gap-2 text-sm" data-event={e.type}>
                  {failed ? (
                    <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  ) : running && last ? (
                    <span className="mt-1.5 ml-1 size-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
                  ) : (
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">{e.message}</span>
                  <time className="font-mono text-xs text-muted-foreground">{clock(e.at)}</time>
                </li>
              );
            })}
          </ol>
          {run.status === "COMPLETED" ? (
            <p className="text-sm text-muted-foreground">
              {run.evidenceCount} {run.evidenceCount === 1 ? "item" : "items"} saved to your vault below.
            </p>
          ) : null}
          {running ? (
            <p className="text-xs text-muted-foreground">
              Runs as a durable background workflow. You can leave this page; the capture still finishes and lands in your vault.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
