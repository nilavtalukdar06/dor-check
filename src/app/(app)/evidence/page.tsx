import { DownloadIcon, ImagePlusIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CaptureDialog } from "@/components/evidence/capture-dialog";
import { CapturePanel } from "@/components/evidence/capture-panel";
import { EvidenceControls } from "@/components/evidence/evidence-controls";
import { EvidenceDetailView } from "@/components/evidence/evidence-detail";
import { EvidenceDrawer } from "@/components/evidence/evidence-drawer";
import { UploadDialog } from "@/components/evidence/upload-dialog";
import { EvidenceCard } from "@/components/investigation/evidence-card";
import { LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { evidenceHref, evidenceParamsSchema, formatStamp } from "@/lib/evidence";
import prisma from "@/lib/prisma";
import { getCaptureRun } from "@/server/capture-view";
import { getEvidenceDetail, listEvidence, vaultWhere, VAULT_PAGE_SIZE } from "@/server/evidence";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Evidence vault" };

type Props = Pick<PageProps<"/evidence">, "searchParams">;

async function HeaderActions({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = evidenceParamsSchema.parse(await searchParams);
  const filters = { type: params.type, q: params.q };
  const count = await prisma.evidence.count({ where: vaultWhere(user.id, filters) });
  const zip = `/api/evidence/download?${new URLSearchParams({ ...(params.type !== "all" ? { type: params.type } : {}), ...(params.q ? { q: params.q } : {}) })}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <UploadDialog params={params} />
      <CaptureDialog />
      {count > 0 ? (
        <Button variant="outline" className="h-10 gap-2 px-4 shadow-xs" nativeButton={false} render={<a href={zip} />}>
          <DownloadIcon data-icon="inline-start" />
          Download all
        </Button>
      ) : null}
    </div>
  );
}

async function Vault({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const params = evidenceParamsSchema.parse(await searchParams);
  const filters = { type: params.type, q: params.q };

  // The grid, the open drawer and the capture being watched load in parallel.
  const [{ items, total }, detail, run] = await Promise.all([
    listEvidence(user.id, filters),
    params.item ? getEvidenceDetail(user.id, params.item) : Promise.resolve(null),
    params.capture ? getCaptureRun(user.id, params.capture) : Promise.resolve(null),
  ]);
  const keep = { type: params.type, q: params.q, capture: params.capture };

  return (
    <>
      {run ? <CapturePanel key={run.id} run={run} params={keep} /> : null}
      <EvidenceControls params={keep} />
      <p className="sr-only" aria-live="polite">
        {total} {total === 1 ? "item" : "items"} found
      </p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-full border bg-soft">
            <ImagePlusIcon className="size-4 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">{params.q || params.type !== "all" ? "No evidence matches" : "Your vault is empty"}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {params.q || params.type !== "all"
              ? "Try another tab or a different search."
              : "Capture a page to save a timestamped screenshot, or upload a chat or payment screenshot. Everything here stays private to you."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Evidence">
          {items.map((e) => (
            <li key={e.id} className="flex">
              <EvidenceCard
                className="w-full"
                href={evidenceHref({ ...keep, item: e.id })}
                title={e.title}
                subject={e.subject ?? (e.url ? new URL(e.url).hostname : null)}
                timestamp={formatStamp(e.capturedAt)}
                kind={e.kind.toLowerCase() as "screenshot" | "extract" | "upload" | "audio" | "document"}
                thumbnailUrl={e.thumbnail}
              />
            </li>
          ))}
        </ul>
      )}
      {total > VAULT_PAGE_SIZE ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the latest {VAULT_PAGE_SIZE} of {total}. Search to find older items.
        </p>
      ) : null}

      {detail ? (
        <EvidenceDrawer key={detail.id} title={detail.title} params={keep}>
          <EvidenceDetailView e={detail} params={keep} />
        </EvidenceDrawer>
      ) : null}
    </>
  );
}

function VaultFallback() {
  return (
    <>
      <div className="flex items-end justify-between gap-4 border-b pb-3">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-9 w-64" />
      </div>
      <LoadingState text="Loading your evidence vault…" />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
            <Skeleton className="aspect-[16/9] rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function EvidencePage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Evidence vault"
        description="Every capture is stored with its URL and timestamp so a report can cite it."
        actions={
          <Suspense fallback={<Skeleton className="h-10 w-72" />}>
            <HeaderActions searchParams={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<VaultFallback />}>
        <Vault searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
