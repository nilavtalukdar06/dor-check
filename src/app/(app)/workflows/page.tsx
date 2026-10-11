import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RefreshButton } from "@/components/moderation/refresh-button";
import { ModeratorOnly } from "@/components/shell/moderator-only";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RUN_STATUS, runDuration, runProgress, workflowTypeLabel, type RunStatusName } from "@/lib/moderation";
import { cn } from "@/lib/utils";
import { getWorkflowKpis, listEvents, listRuns } from "@/server/workflows";

export const metadata = { title: "Workflow runs" };

const clock = (d: Date) => new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(d);
const inngestUrl = () => (process.env.INNGEST_DEV === "1" ? `${process.env.INNGEST_BASE_URL ?? "http://localhost:8288"}/runs` : "https://app.inngest.com");
type SP = Record<string, string | string[] | undefined>;

async function Kpis() {
  // Counts depend on the current time, so they are worked out per request.
  await connection();
  const k = await getWorkflowKpis();
  const items = [
    { label: "Runs today", value: String(k.runsToday) },
    { label: "Success rate", value: k.successRate === null ? "–" : `${k.successRate}%`, hint: "last 7 days" },
    { label: "Median duration", value: runDuration(k.medianMs), hint: "last 7 days" },
    { label: "Retries", value: String(k.retries), hint: "today" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="kpis">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs" data-kpi={i.label}>
          <span className="text-[13px] text-muted-foreground">{i.label}{i.hint ? <span className="text-muted-foreground/70"> · {i.hint}</span> : null}</span>
          <span className="text-3xl font-semibold tracking-tight">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

async function Runs({ selected }: { selected?: string }) {
  // Counts depend on the current time, so they are worked out per request.
  await connection();
  const runs = await listRuns();
  if (!runs.length) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No runs yet. They appear as investigations, price checks, captures and syncs happen.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow><TableHead className="pl-5">Run</TableHead><TableHead>Type</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Progress</TableHead><TableHead className="pr-5 text-right">Time</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => {
            const st = RUN_STATUS[r.status as RunStatusName] ?? { label: r.status, variant: "outline" as const };
            return (
              <TableRow key={r.id} data-run={r.runCode} className={cn(selected === r.id && "bg-soft")}>
                <TableCell className="pl-5 font-mono text-xs"><Link href={`/workflows?run=${r.id}`} scroll={false} className="hover:underline" aria-label={`Show events of ${r.runCode}`}>{r.runCode}</Link></TableCell>
                <TableCell>{workflowTypeLabel(r.type)}</TableCell>
                <TableCell className="max-w-[16rem] break-words" title={r.error ?? undefined}>{r.subject}</TableCell>
                <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">{runProgress(r)}</TableCell>
                <TableCell className="pr-5 text-right whitespace-nowrap">{runDuration(r.durationMs)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

async function Stream({ runId }: { runId?: string }) {
  const events = await listEvents(runId);
  return (
    <ul className="flex flex-col gap-2.5" data-testid="events">
      {events.length === 0 ? <li className="text-sm text-muted-foreground">No events yet.</li> : null}
      {events.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3" data-event={e.type} title={e.message ?? undefined}>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="w-fit rounded-md border border-info-border bg-info-soft px-2 py-0.5 font-mono text-xs text-info">{e.type}</span>
            {!runId ? <span className="font-mono text-[11px] text-muted-foreground">{e.runCode}</span> : e.message ? <span className="text-xs text-muted-foreground">{e.message}</span> : null}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{clock(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

async function Body({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const run = typeof sp.run === "string" ? sp.run : undefined;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-xl border bg-card shadow-xs" aria-label="Runs">
        <Suspense fallback={<div className="flex flex-col gap-3 p-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>}>
          <Runs selected={run} />
        </Suspense>
      </section>
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs" aria-label="Event stream">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Event stream</h2>
          {run ? <Link href="/workflows" scroll={false} className="text-xs text-muted-foreground underline">All runs</Link> : null}
        </div>
        <Suspense key={run ?? "all"} fallback={<Skeleton className="h-48 rounded-lg" />}>
          <Stream runId={run} />
        </Suspense>
        <a href={inngestUrl()} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ExternalLinkIcon className="size-3.5" aria-hidden />Open in Inngest</a>
      </section>
    </div>
  );
}

export default function WorkflowsPage({ searchParams }: PageProps<"/workflows">) {
  return (
    <ModeratorOnly loadingLabel="Checking your access…">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[28px] leading-9 font-semibold tracking-tight">Workflow runs</h1>
            <p className="text-[15px] text-muted-foreground">Durable background jobs powered by Inngest. Failed steps retry on their own.</p>
          </div>
          <RefreshButton />
        </div>
        <Suspense fallback={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>}>
          <Kpis />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <Body searchParams={searchParams} />
        </Suspense>
      </div>
    </ModeratorOnly>
  );
}
