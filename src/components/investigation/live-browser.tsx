"use client";

import { GlobeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";

type LiveResponse = { live: true; url: string } | { live: false; reason: string };

/**
 * Live, read-only view of the remote browser while an investigation runs. The URL comes from
 * the server on request (it only works while the session is open) and is shown in a sandboxed
 * iframe with pointer events off, so it can be watched but not driven.
 *
 * It never fails the run: if the view cannot load, it says so and the timeline carries on.
 */
export function LiveBrowser({
  investigationId,
  host,
  onDisconnected,
  className,
}: {
  investigationId: string;
  /** Shown in the fake address bar, e.g. the domain being checked. */
  host?: string;
  /** Called when the remote session closes. */
  onDisconnected?: () => void;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"starting" | "live" | "ended" | "unavailable">("starting");
  const callback = useRef(onDisconnected);
  useEffect(() => {
    callback.current = onDisconnected;
  });

  // Ask for the live URL until the session exists, then stop.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/investigations/${investigationId}/live`, { cache: "no-store" });
        const data = (await res.json()) as LiveResponse;
        if (cancelled) return;
        if (data.live) {
          setUrl(data.url);
          setState("live");
          return;
        }
        if (data.reason === "not_running") return setState("ended");
        if (data.reason === "unavailable") return setState("unavailable");
      } catch {
        // network hiccup: try again
      }
      if (++attempts > 40) return setState("unavailable");
      timer = setTimeout(poll, 1500);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [investigationId]);

  // The embedded page tells us when the session closes.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data === "browserbase-disconnected") {
        setState("ended");
        callback.current?.();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 rounded-t-lg border border-b-0 bg-muted px-3 py-1.5">
        <span className="flex gap-1" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/20" />
          <span className="size-2 rounded-full bg-foreground/20" />
          <span className="size-2 rounded-full bg-foreground/20" />
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <GlobeIcon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{host ?? "secure browser"}</span>
        </span>
        {state === "live" ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-danger">
            <span className="size-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
            Live
          </span>
        ) : null}
      </div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-b-lg border bg-card">
        {state === "live" && url ? (
          <iframe
            src={url}
            title="Live view of the browser checking this page"
            sandbox="allow-same-origin allow-scripts"
            allow="clipboard-read; clipboard-write"
            style={{ pointerEvents: "none" }}
            className="size-full border-0"
          />
        ) : state === "starting" ? (
          <>
            <Skeleton className="size-full rounded-none" />
            <LoadingState text="Starting a secure browser…" className="absolute inset-0 justify-center" />
          </>
        ) : (
          <div className="flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {state === "ended" ? "The browser session has ended." : "The live view is not available right now. The check continues without it."}
          </div>
        )}
      </div>
    </div>
  );
}
