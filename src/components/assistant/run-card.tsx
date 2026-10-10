"use client";

import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getRunProgressAction, type RunProgress } from "@/app/(app)/assistant/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const DONE = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/** A check the assistant started: live progress, a way into the live run, and the result when it is ready. */
export function RunCard({ investigationId }: { investigationId: string }) {
  const [p, setP] = useState<RunProgress | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await getRunProgressAction(investigationId).catch(() => null);
      if (stopped) return;
      if (!next) return setGone(true);
      setP(next);
      if (!DONE.has(next.status)) timer = setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [investigationId]);

  if (gone) return null;
  const finished = p ? DONE.has(p.status) : false;
  const pct = p && p.totalSteps ? Math.min(100, Math.round((p.stepsDone / p.totalSteps) * 100)) : 4;
  return (
    <div className="flex max-w-[34rem] flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs" data-testid="run-card" data-status={p?.status ?? "loading"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          {!p || !finished ? <Spinner /> : p.status === "COMPLETED" ? <CheckCircle2Icon className="size-4 text-ok" aria-hidden /> : <XCircleIcon className="size-4 text-destructive" aria-hidden />}
          {!p ? "Starting the check" : p.status === "COMPLETED" ? "Investigation finished" : p.status === "FAILED" ? "The check could not finish" : p.status === "CANCELLED" ? "Check stopped" : "Running investigation"}
        </div>
        {p && !finished ? <span className="text-xs text-muted-foreground">step {Math.min(p.stepsDone + 1, p.totalSteps)} of {p.totalSteps}</span> : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={finished ? 100 : pct} aria-valuemin={0} aria-valuemax={100} aria-label="Investigation progress">
        <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${finished ? 100 : Math.max(pct, 4)}%` }} />
      </div>
      {p?.latest && !finished ? <p className="truncate text-xs text-muted-foreground">{p.latest}</p> : null}
      <div className="flex flex-wrap gap-2">
        {p?.status === "COMPLETED" ? (
          <Button variant="outline" size="sm" render={<Link href={`/investigate/${investigationId}/verdict`} />} nativeButton={false}>See the result</Button>
        ) : null}
        <Button variant="outline" size="sm" render={<Link href={`/investigate/${investigationId}`} />} nativeButton={false}>Open live run</Button>
      </div>
    </div>
  );
}
