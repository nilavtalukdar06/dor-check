"use client";

import { useRealtime } from "inngest/react";
import { CircleAlertIcon, FlagIcon, GlobeIcon, MapPinIcon, ScaleIcon, UserRoundIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cancelInvestigationAction } from "@/app/(app)/investigate/actions";
import { fetchInvestigationRunToken } from "@/app/(app)/investigate/realtime";
import { LiveBrowser } from "@/components/investigation/live-browser";
import { StepTimeline, type TimelineStep } from "@/components/investigation/step-timeline";
import { LoadingState } from "@/components/shell/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { investigationRunChannel, type InvestigationUpdate } from "@/inngest/channels";
import type { InvestigationView } from "@/server/investigation-view";

/** If a live message is missed (tab asleep, reconnect), the page re-reads the database. */
const FALLBACK_REFRESH_MS = 6000;

const clock = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(d));
const startedAt = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(d)).replace(" am", " am").replace(" pm", " pm");

const KIND_ICON: Record<string, typeof GlobeIcon> = { WEB_PAGE: GlobeIcon, DIRECTORY: MapPinIcon, TARIFF: ScaleIcon, ADVISORY: CircleAlertIcon, REPORT: FlagIcon, KNOWLEDGE: GlobeIcon };
const KIND_LABEL: Record<string, string> = { WEB_PAGE: "Web page", DIRECTORY: "Directory", TARIFF: "Tariff", ADVISORY: "Advisory", REPORT: "Community report", KNOWLEDGE: "Knowledge base" };

/** A link as a short line: the site for a web address, the path for an app link. */
function subline(url: string | null) {
  if (!url) return null;
  if (url.startsWith("/")) return url;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const duration = (ms: number | null) => (ms === null ? undefined : `${(ms / 1000).toFixed(1)}s`);

/**
 * The live run: the agent's steps, the remote browser, and what it has found so far. Starts from the
 * database, then Inngest Realtime tells it when something happens, so it re-reads at once. When the
 * run finishes the route refreshes and the server sends a completed run to its verdict.
 */
export function RunScreen({ view }: { view: InvestigationView }) {
  const router = useRouter();
  const [cancelling, startCancel] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const live = view.status === "RUNNING" || view.status === "QUEUED";

  const { messages, connectionStatus } = useRealtime({
    channel: investigationRunChannel(view.id),
    topics: ["update", "finished"] as const,
    token: () => fetchInvestigationRunToken(view.id),
    enabled: live,
  });

  const finished = messages.all.some((m) => m.topic === "finished");
  useEffect(() => {
    if (finished) router.refresh();
  }, [finished, router]);

  // Each live message is a reason to re-read, a moment later so a burst becomes one refresh.
  const count = messages.all.length;
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!live || count === 0) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 350);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [count, live, router]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => router.refresh(), FALLBACK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, router]);

  // The newest thing that happened, from the live feed if it is newer than the page.
  const latest = useMemo(() => {
    const updates = messages.all.filter((m) => m.topic === "update").map((m) => m.data as InvestigationUpdate);
    return [...updates].reverse().find((u) => u.kind === "event" && u.message)?.message ?? view.latest;
  }, [messages.all, view.latest]);

  const timeline: TimelineStep[] = view.steps.map((s) => ({
    title: s.title,
    status: s.status,
    duration: s.label ?? duration(s.durationMs) ?? (s.status === "running" ? "running" : s.status === "retrying" ? "retrying" : "waiting"),
    events: s.events,
    tools: s.tools,
    note: s.note ?? undefined,
  }));
  const stepNo = Math.min(view.stepsDone + 1, view.totalSteps);
  const done = view.status === "FAILED" || view.status === "CANCELLED";
  const heading = view.status === "FAILED" ? "This check could not finish" : view.status === "CANCELLED" ? "Investigation cancelled" : "Investigation in progress";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{heading}</h1>
          <p className="text-[15px] text-muted-foreground">
            <span className="font-mono text-sm">{view.subject}</span> · started {startedAt(view.startedAt ?? new Date())}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={view.status === "FAILED" ? "danger" : view.status === "CANCELLED" ? "outline" : "info"} data-testid="status">
            {view.status === "RUNNING" || view.status === "QUEUED" ? "Running" : view.status === "FAILED" ? "Failed" : "Cancelled"}
          </Badge>
          {live ? (
            <Button
              variant="outline"
              className="h-10 gap-2 px-4 shadow-xs"
              disabled={cancelling}
              onClick={() =>
                startCancel(async () => {
                  setCancelError(null);
                  const res = await cancelInvestigationAction(view.id);
                  if (!res.ok) return setCancelError(res.error ?? "Could not cancel.");
                  router.refresh();
                })
              }
            >
              {cancelling ? <Spinner data-icon="inline-start" /> : <XIcon data-icon="inline-start" />}
              {cancelling ? "Cancelling…" : "Cancel"}
            </Button>
          ) : (
            <Button className="h-10 px-4" nativeButton={false} render={<Link href="/investigate" />}>
              {done ? "Try again" : "New investigation"}
            </Button>
          )}
        </div>
      </div>
      {cancelError ? <p role="alert" className="text-sm text-danger">{cancelError}</p> : null}
      {view.error && view.status === "FAILED" ? <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">{view.error}</p> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-label="Agent timeline" className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[15px] font-semibold">Agent timeline</h2>
              <p className="text-[13px] text-muted-foreground">Durable steps, retried automatically if one fails</p>
            </div>
            <div className="flex w-36 shrink-0 flex-col items-end gap-1.5">
              <span className="text-xs text-muted-foreground">Step {stepNo} of {view.totalSteps}</span>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={view.totalSteps} aria-valuenow={view.stepsDone}>
                <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${(view.stepsDone / view.totalSteps) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5">
            {live ? <LoadingState text={latest ? `${latest}…` : connectionStatus === "open" ? "Waiting for the first step…" : "Connecting to the live feed…"} /> : null}
            <StepTimeline steps={timeline} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t bg-soft px-5 py-3 text-xs text-muted-foreground">
            <span>Run id <span className="font-mono">{view.runCode}</span></span>
            <span className="inline-flex items-center gap-1.5">
              {live ? <span className={`size-1.5 rounded-full ${connectionStatus === "open" ? "animate-pulse bg-ok" : "bg-muted-foreground"}`} aria-hidden /> : null}
              {live ? (connectionStatus === "open" ? "Streaming live" : "Updating every few seconds") : "Finished"}
            </span>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Live preview" className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs" data-testid="live-preview">
            <h2 className="text-[15px] font-semibold">Live preview</h2>
            {live && view.watchBrowser ? (
              <>
                <LiveBrowser investigationId={view.id} host={view.subject} onDisconnected={() => router.refresh()} />
                {latest ? <p className="text-xs text-muted-foreground">{latest}</p> : null}
              </>
            ) : view.screenshot?.link ? (
              <figure className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={view.screenshot.link} alt={`Screenshot of ${view.subject}`} className="w-full rounded-lg border bg-muted" />
                <figcaption className="font-mono text-xs text-muted-foreground">
                  Captured at {clock(view.screenshot.capturedAt)} IST{view.screenshot.width && view.screenshot.height ? ` · ${view.screenshot.width} × ${view.screenshot.height}` : ""}
                </figcaption>
              </figure>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {view.wantsCapture ? "No screenshot was captured for this check." : "Page capture was not requested for this check."}
              </p>
            )}
          </section>

          <section aria-label="Sources found" className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <h2 className="px-5 pt-5 pb-3 text-[15px] font-semibold">Sources found</h2>
            {view.found.length === 0 ? (
              <p className="border-t px-5 py-5 text-sm text-muted-foreground">{live ? "Nothing yet. Sources appear here as the agent finds them." : "No sources were found."}</p>
            ) : (
              <ul>
                {view.found.map((f) => {
                  const Icon = KIND_ICON[f.kind] ?? UserRoundIcon;
                  return (
                    <li key={`${f.kind}-${f.title}`} className="flex items-center gap-3 border-t px-5 py-3.5" data-source-kind={f.kind}>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-soft">
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{f.title}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">{f.label ?? subline(f.url) ?? KIND_LABEL[f.kind]}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
