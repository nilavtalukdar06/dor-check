import { LockIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DirectoryAdmin } from "@/components/moderation/directory-admin";
import { FlaggedComments } from "@/components/moderation/flagged-comments";
import { ListingRequests } from "@/components/moderation/listing-requests";
import { QueueTable } from "@/components/moderation/queue-table";
import { TariffsAdmin } from "@/components/moderation/tariffs-admin";
import { ModeratorOnly } from "@/components/shell/moderator-only";
import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { shortDuration, type Priority } from "@/lib/moderation";
import prisma from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { listAdminProperties, listListingRequests } from "@/server/directory-admin";
import { getModerationStats, isReportStatus, listFlaggedComments, listQueue } from "@/server/moderation";
import { getPriceFormOptions } from "@/server/price-options";
import { listDistrictsForFilter } from "@/server/reports-view";
import { getTariffAdmin } from "@/server/tariffs-admin";

export const metadata = { title: "Moderation queue" };

const TABS = [
  { value: "queue", label: "Queue" },
  { value: "comments", label: "Flagged comments" },
  { value: "listings", label: "Listing requests" },
  { value: "directory", label: "Directory" },
  { value: "tariffs", label: "Tariffs" },
] as const;
type Tab = (typeof TABS)[number]["value"];
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function Stats() {
  // Counts depend on the current time, so they are worked out per request.
  await connection();
  const s = await getModerationStats();
  const items = [
    { label: "Waiting", value: String(s.waiting) },
    { label: "In review", value: String(s.inReview) },
    { label: "Resolved this week", value: String(s.resolvedThisWeek) },
    { label: "Avg time to review", value: shortDuration(s.avgReviewMs) },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="mod-stats">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs" data-stat={i.label}>
          <span className="text-[13px] text-muted-foreground">{i.label}</span>
          <span className="text-3xl font-semibold tracking-tight">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

async function TabCounts({ tab }: { tab: Tab }) {
  // Counts depend on the current time, so they are worked out per request.
  await connection();
  const s = await getModerationStats();
  const count: Partial<Record<Tab, number>> = { queue: s.waiting + s.inReview, comments: s.flaggedComments, listings: s.listingRequests, tariffs: s.pendingTariffs };
  return <TabNav tab={tab} count={count} />;
}

function TabNav({ tab, count = {} }: { tab: Tab; count?: Partial<Record<Tab, number>> }) {
  return (
    <nav aria-label="Moderation" className="flex gap-6 overflow-x-auto px-5 pt-4">
      {TABS.map((t) => (
        <Link key={t.value} href={`/moderation?tab=${t.value}`} aria-current={tab === t.value ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-0.5 pb-3 text-sm outline-none focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50", tab === t.value ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")} data-tab={t.value}>
          {t.label}
          {count[t.value] ? <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{count[t.value]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

async function TabBody({ tab, sp }: { tab: Tab; sp: SP }) {
  if (tab === "comments") {
    const items = await listFlaggedComments();
    return <FlaggedComments items={items.map((c) => ({ ...c, flaggedAt: iso(c.flaggedAt) }))} />;
  }
  if (tab === "listings") {
    const items = await listListingRequests();
    return <ListingRequests items={items.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />;
  }
  if (tab === "directory") {
    const [items, districts, options] = await Promise.all([listAdminProperties(), prisma.district.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }), getPriceFormOptions()]);
    return (
      <DirectoryAdmin
        items={items.map((p) => ({ ...p, edit: { id: p.id, name: p.edit.name, type: p.edit.type, districtId: p.edit.districtId, description: String(p.edit.description ?? ""), address: String(p.edit.address ?? ""), domain: String(p.edit.domain ?? ""), phone: String(p.edit.phone ?? ""), email: String(p.edit.email ?? ""), businessUpi: String(p.edit.businessUpi ?? ""), registrationNumber: String(p.edit.registrationNumber ?? ""), lat: (p.edit.lat as number | undefined) ?? null, lng: (p.edit.lng as number | undefined) ?? null } }))}
        districts={districts}
        popular={options.popularPlaces}
      />
    );
  }
  if (tab === "tariffs") {
    const [t, options] = await Promise.all([getTariffAdmin(), getPriceFormOptions()]);
    return (
      <TariffsAdmin
        researched={t.researched.map((r) => ({ ...r, researchedAt: iso(r.researchedAt) }))}
        boards={t.boards.map((b) => ({ ...b, lastVerifiedAt: iso(b.lastVerifiedAt) }))}
        curated={t.curated.map((c) => ({ ...c, effectiveOn: c.effectiveOn.toISOString() }))}
        places={t.places}
        districts={t.districts}
        popular={options.popularPlaces}
      />
    );
  }
  const status = one(sp.status);
  const priority = one(sp.priority);
  const [rows, districts] = await Promise.all([
    listQueue({ status: status === "ALL" ? "ALL" : isReportStatus(status) ? status : "OPEN", category: one(sp.category), district: one(sp.district), priority: priority && ["HIGH", "MEDIUM", "LOW"].includes(priority) ? (priority as Priority) : undefined }),
    listDistrictsForFilter(),
  ]);
  return <QueueTable rows={rows} districts={districts} />;
}

async function Moderation({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.value === sp.tab)?.value ?? "queue") as Tab;
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="moderation" data-active-tab={tab}>
      <Suspense fallback={<TabNav tab={tab} />}>
        <TabCounts tab={tab} />
      </Suspense>
      <div className="pt-3">
        <Suspense key={JSON.stringify({ ...sp, review: undefined })} fallback={<div className="flex flex-col gap-3 border-t p-5"><LoadingState text="Loading…" />{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>}>
          <TabBody tab={tab} sp={sp} />
        </Suspense>
      </div>
    </section>
  );
}

export default function ModerationPage({ searchParams }: PageProps<"/moderation">) {
  return (
    <ModeratorOnly loadingLabel="Checking your access…">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[28px] leading-9 font-semibold tracking-tight">Moderation queue</h1>
            <p className="text-[15px] text-muted-foreground">Review reports, publish official findings and manage the directory. Protected by Clerk roles.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-danger-border bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger"><LockIcon className="size-3" aria-hidden />Moderator only</span>
        </div>
        <Suspense fallback={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>}>
          <Stats />
        </Suspense>
        <Moderation searchParams={searchParams} />
      </div>
    </ModeratorOnly>
  );
}
