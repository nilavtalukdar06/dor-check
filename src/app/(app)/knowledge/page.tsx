import { DatabaseIcon } from "lucide-react";
import { Suspense } from "react";
import { StatCard } from "@/components/common/stat-card";
import { SyncButton } from "@/components/knowledge/sync-button";
import { TestQuery } from "@/components/knowledge/test-query";
import { LoadingState } from "@/components/shell/loading";
import { ModeratorOnly } from "@/components/shell/moderator-only";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getKnowledgeOverview, type SourceRow } from "@/server/knowledge-view";

export const metadata = { title: "Knowledge base" };

const VIA: Record<SourceRow["via"], string> = {
  FIRECRAWL: "Firecrawl",
  UPLOAD: "Upload",
  INTERNAL: "Our database",
  MANUAL: "Manual",
};
const STATUS: Record<
  SourceRow["status"],
  { label: string; variant: "ok" | "warning" | "danger" | "info" | "outline" }
> = {
  INDEXED: { label: "Indexed", variant: "ok" },
  SYNCING: { label: "Syncing", variant: "warning" },
  FAILED: { label: "Failed", variant: "danger" },
  PENDING: { label: "Not synced", variant: "info" },
  PAUSED: { label: "Paused", variant: "outline" },
};

const clock = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(d);
const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

function updated(s: SourceRow) {
  if (s.isLive && s.status === "INDEXED") return "Live";
  if (!s.lastSyncedAt) return "Never";
  if (dayKey(s.lastSyncedAt) === dayKey(new Date()))
    return `Today ${clock(s.lastSyncedAt)}`;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(s.lastSyncedAt);
}

async function KnowledgeView() {
  const o = await getKnowledgeOverview();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vectors" value={o.vectors.toLocaleString("en-IN")} />
        <StatCard label="Sources" value={o.sources.length} />
        <StatCard
          label="Index"
          value={
            <span className="text-2xl break-all">
              {o.indexName ?? "Not set"}
            </span>
          }
        />
        <StatCard
          label="Last sync"
          value={o.lastSyncedAt ? clock(o.lastSyncedAt) : "Never"}
        />
      </div>

      {!o.configured ? (
        <p
          role="alert"
          className="rounded-lg border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          The vector index is not set up. Add PINECONE_API_KEY and
          PINECONE_INDEX to the environment to sync and search.
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <section
          aria-label="Sources"
          className="relative min-w-0 overflow-x-auto rounded-xl border bg-card shadow-xs"
        >
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b bg-soft text-left text-[13px] text-muted-foreground">
                <th className="px-5 py-3 font-normal">Source</th>
                <th className="px-3 py-3 font-normal">Via</th>
                <th className="px-3 py-3 font-normal">Contents</th>
                <th className="px-3 py-3 font-normal">Updated</th>
                <th className="px-3 py-3 font-normal">Status</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {o.sources.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-muted-foreground"
                  >
                    <DatabaseIcon className="mx-auto mb-2 size-4" aria-hidden />
                    No sources yet. Run{" "}
                    <code className="font-mono text-xs">
                      npm run knowledge:sync
                    </code>{" "}
                    to create the built-in ones.
                  </td>
                </tr>
              ) : null}
              {o.sources.map((s) => {
                const st = STATUS[s.status];
                return (
                  <tr
                    key={s.id}
                    className="border-b last:border-b-0"
                    data-source={s.id}
                    data-status={s.status}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-medium">{s.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {s.host ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">{VIA[s.via]}</td>
                    <td
                      className="px-3 py-3.5 whitespace-nowrap"
                      title={`${s.chunkCount} chunks in the index`}
                    >
                      {s.recordCount.toLocaleString("en-IN")} {s.recordUnit}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      {updated(s)}
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      {s.status === "FAILED" && s.error ? (
                        <span className="mt-1 block max-w-40 text-xs text-danger">
                          {s.error}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <SyncButton
                        sourceId={s.id}
                        name={s.name}
                        syncing={s.status === "SYNCING"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <TestQuery disabled={!o.configured || o.vectors === 0} />
      </div>
    </>
  );
}

function Fallback() {
  return (
    <>
      <LoadingState text="Loading sources and the index…" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs"
          >
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </>
  );
}

export default function KnowledgePage() {
  return (
    <ModeratorOnly loadingLabel="Checking your access…">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Knowledge base"
          description="Vector index of tariffs, directory entries, advisories and past reports. Every chunk keeps its source URL and retrieval time."
        />
        <Suspense fallback={<Fallback />}>
          <KnowledgeView />
        </Suspense>
      </div>
    </ModeratorOnly>
  );
}
