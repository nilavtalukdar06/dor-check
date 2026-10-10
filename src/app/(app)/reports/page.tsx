import { FlagIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ReportControls } from "@/components/reports/report-controls";
import { ReportStatusBadge } from "@/components/reports/report-status";
import { LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_LABEL, REPORT_PAGE_SIZE, reportListParamsSchema, reportsHref, type REPORT_CATEGORIES } from "@/lib/reports";
import { listDistrictsForFilter, listReports } from "@/server/reports-view";
import { getRole } from "@/server/roles";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Community reports" };

const day = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);
const EMPTY: Record<string, string> = {
  all: "No reports match. Try another search, or be the first to report.",
  following: "You are not following any reports yet. Open a report and press Follow.",
  mine: "You have not submitted a report yet.",
  verified: "No report has been verified yet.",
};

async function Reports({ searchParams }: Pick<PageProps<"/reports">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const params = reportListParamsSchema.parse(await searchParams);
  const [{ rows, total, pages }, districts] = await Promise.all([listReports({ id: user.id, role: (await getRole()) ?? "TRAVELLER" }, params), listDistrictsForFilter()]);
  const from = (params.page - 1) * REPORT_PAGE_SIZE;

  return (
    <>
      <ReportControls params={params} districts={districts} />
      <p className="sr-only" aria-live="polite">{total} {total === 1 ? "report" : "reports"} found</p>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-full border bg-soft"><FlagIcon className="size-4 text-muted-foreground" /></span>
          <p className="text-sm font-medium">No reports here</p>
          <p className="max-w-sm text-sm text-muted-foreground">{EMPTY[params.tab]}</p>
          <Button className="mt-1 h-9 gap-2" nativeButton={false} render={<Link href="/reports/new" />}>New report</Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b bg-soft text-left text-[13px] text-muted-foreground">
                  <th className="px-5 py-3 font-normal">Reference</th>
                  <th className="px-3 py-3 font-normal">Summary</th>
                  <th className="px-3 py-3 font-normal">Category</th>
                  <th className="px-3 py-3 font-normal">District</th>
                  <th className="px-3 py-3 font-normal">Date</th>
                  <th className="px-5 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.reference} className="border-b last:border-b-0 hover:bg-soft/60" data-report={r.reference}>
                    <td className="px-5 py-3.5 font-mono text-xs"><Link href={`/reports/${r.reference}`} className="underline-offset-2 hover:underline">{r.reference}</Link></td>
                    <td className="px-3 py-3.5 font-medium"><Link href={`/reports/${r.reference}`} className="hover:underline">{r.summary}</Link>{r.mine ? <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">Yours</span> : null}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap">{CATEGORY_LABEL[r.category as (typeof REPORT_CATEGORIES)[number]]}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-muted-foreground">{r.districtName}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-muted-foreground">{day(r.date)}</td>
                    <td className="px-5 py-3.5"><ReportStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-soft px-5 py-3 text-xs text-muted-foreground">
            <span>{from + 1} to {from + rows.length} of {total} {total === 1 ? "report" : "reports"}</span>
            <span className="flex items-center gap-3">
              Page {params.page} of {pages}
              {params.page > 1 ? <Link href={reportsHref({ ...params, page: params.page - 1 })} className="underline underline-offset-2">Previous</Link> : null}
              {params.page < pages ? <Link href={reportsHref({ ...params, page: params.page + 1 })} className="underline underline-offset-2">Next</Link> : null}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function Fallback() {
  return (
    <>
      <div className="flex items-end justify-between gap-4 border-b pb-3"><Skeleton className="h-5 w-64" /><Skeleton className="h-9 w-72" /></div>
      <LoadingState text="Loading reports…" />
      <div className="overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b px-5 py-4 last:border-b-0"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-3.5 flex-[3]" /><Skeleton className="h-3.5 flex-1" /><Skeleton className="h-5 w-16 rounded-full" /></div>
        ))}
      </div>
    </>
  );
}

export default function ReportsPage({ searchParams }: Pick<PageProps<"/reports">, "searchParams">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Community reports"
        description="What travellers have reported. Official findings are shown separately from user allegations."
        actions={<Button className="h-10 gap-2 px-4" nativeButton={false} render={<Link href="/reports/new" />}><PlusIcon data-icon="inline-start" />New report</Button>}
      />
      <Suspense fallback={<Fallback />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
