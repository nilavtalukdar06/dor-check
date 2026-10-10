"use client";

import { CheckCircle2Icon, ExternalLinkIcon, ShieldAlertIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowseProgressAction } from "@/app/(app)/assistant/actions";
import { LiveBrowser } from "@/components/investigation/live-browser";
import type { CaptureRunView } from "@/server/capture-view";

export type BrowseFacts = { title: string | null; businessName: string | null; quotedPrices: string[]; paymentInstructions: string | null; asksForAdvancePayment: boolean; notes: string | null; showsPaymentIds: boolean };

/**
 * A page the assistant opened for the person. While the browser works they watch it live, right
 * here in the chat; afterwards the screenshot stays, with what the page showed. Read-only: the
 * live view cannot be clicked.
 */
export function BrowserCard({ captureId, host, facts }: { captureId: string; host: string; facts: BrowseFacts | null }) {
  const [run, setRun] = useState<CaptureRunView | null>(null);

  // Follow the capture until it ends; after that one more read gives the screenshot.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await getBrowseProgressAction(captureId).catch(() => null);
      if (stopped || !next) return;
      setRun(next);
      if (next.status === "RUNNING") timer = setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [captureId]);

  const running = !run || run.status === "RUNNING";
  return (
    <div className="flex max-w-[34rem] flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs" data-testid="browser-card" data-status={run?.status ?? "loading"}>
      <div className="flex items-center justify-between gap-3 px-1 text-sm font-semibold">
        <span className="flex items-center gap-2">
          {running ? null : run.status === "COMPLETED" ? <CheckCircle2Icon className="size-4 text-ok" aria-hidden /> : <XCircleIcon className="size-4 text-destructive" aria-hidden />}
          {running ? "Browsing" : run.status === "COMPLETED" ? "Page opened" : "The page could not be opened"}
          <span className="font-mono text-xs font-normal text-muted-foreground">{host}</span>
        </span>
        <span className="text-xs font-normal text-muted-foreground">Read-only</span>
      </div>

      {running ? (
        <LiveBrowser investigationId={captureId} host={host} />
      ) : run.screenshot?.link ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={run.screenshot.link} alt={`Screenshot of ${host}`} className="aspect-[16/10] w-full rounded-lg border object-cover object-top" data-testid="browser-shot" />
      ) : run.status === "FAILED" ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{run.error ?? "The page did not load."}</p>
      ) : null}

      {facts && !running ? (
        <div className="flex flex-col gap-2 px-1 text-sm" data-testid="browser-facts">
          {facts.quotedPrices.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Prices shown:</span>
              {facts.quotedPrices.slice(0, 6).map((p) => <span key={p} className="rounded-md border bg-background px-2 py-0.5 text-xs">{p}</span>)}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No prices were visible on this page.</p>
          )}
          {facts.asksForAdvancePayment || facts.showsPaymentIds ? (
            <p className="flex items-center gap-1.5 text-xs text-warning" data-testid="browser-warning"><ShieldAlertIcon className="size-3.5" aria-hidden />{facts.asksForAdvancePayment ? "This page asks for money in advance." : "This page shows payment details."}</p>
          ) : null}
        </div>
      ) : null}

      {!running && run?.status === "COMPLETED" && run.screenshot ? (
        <Link href={`/evidence?item=${run.screenshot.evidenceId}`} className="inline-flex w-fit items-center gap-1.5 px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
          <ExternalLinkIcon className="size-3" aria-hidden />Saved to your evidence vault
        </Link>
      ) : null}
    </div>
  );
}
