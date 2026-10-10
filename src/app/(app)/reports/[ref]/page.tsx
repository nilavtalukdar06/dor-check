import { CheckCircle2Icon, EyeOffIcon, ImageIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { FollowButton } from "@/components/reports/follow-button";
import { ReportStatusBadge } from "@/components/reports/report-status";
import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { rs } from "@/lib/format";
import { CATEGORY_LABEL, KIND_LABEL, type REPORT_CATEGORIES, type REPORT_KINDS } from "@/lib/reports";
import { getReportDetail, reasonLabel } from "@/server/reports-view";
import { getRole } from "@/server/roles";
import { getCurrentUser } from "@/server/users";

export async function generateMetadata({ params }: Pick<PageProps<"/reports/[ref]">, "params">) {
  return { title: `Report ${(await params).ref}` };
}

const date = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
const stamp = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);

async function Report({ params }: Pick<PageProps<"/reports/[ref]">, "params">) {
  const { ref } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const r = await getReportDetail({ id: user.id, role: (await getRole()) ?? "TRAVELLER" }, ref.toUpperCase());
  if (!r) notFound();

  return (
    <div className="flex flex-col gap-6" data-testid="report-page" data-status={r.status}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-mono text-[28px] leading-9 font-semibold tracking-tight">{r.reference}</h1>
          <p className="text-[15px] text-muted-foreground">
            {CATEGORY_LABEL[r.category as (typeof REPORT_CATEGORIES)[number]]} · {r.districtName}
            {r.incidentAt ? ` · incident ${date(r.incidentAt)}` : ` · reported ${date(r.createdAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportStatusBadge status={r.status} />
          <FollowButton reference={r.reference} following={r.following} />
        </div>
      </div>

      {r.hidden || r.status === "REJECTED" ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-soft px-4 py-2.5 text-sm text-warning">
          <EyeOffIcon className="size-4 shrink-0" aria-hidden />
          {r.status === "REJECTED" ? "A moderator rejected this report, so only you and moderators can see it." : "This report is hidden from the public list. Only you and moderators can see it."}
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Reporter allegation" className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">Reporter allegation</h2>
              <span className="rounded-full border px-2.5 py-0.5 text-xs">Not verified</span>
              <span className="text-xs text-muted-foreground">{KIND_LABEL[r.kind as (typeof REPORT_KINDS)[number]]}</span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="allegation">{r.allegation}</p>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {r.locationText ? <div className="flex gap-1.5"><dt>Place</dt><dd className="text-foreground">{r.locationText}</dd></div> : null}
              {r.amountInr ? <div className="flex gap-1.5"><dt>Amount</dt><dd className="text-foreground">{rs(r.amountInr)}</dd></div> : null}
            </dl>
            {r.reportedUrl ? <code className="w-fit max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-xs" data-testid="reported-url">{r.reportedUrl}</code> : null}
            <p className="text-xs text-muted-foreground">This is what the reporter says happened. It has not been checked by us.</p>
          </section>

          {r.findings.map((f) => (
            <section key={f.id} aria-label="Official finding" className="flex flex-col gap-3 rounded-xl border border-ok-border bg-ok-soft p-5" data-testid="official-finding">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold">Official finding</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-ok-border bg-card px-2.5 py-0.5 text-xs text-ok"><CheckCircle2Icon className="size-3" aria-hidden />Moderator</span>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line">{f.body}</p>
              <p className="text-xs text-muted-foreground">Reviewed {date(f.publishedAt)} by the moderation team</p>
            </section>
          ))}

          {r.similar.length ? (
            <section aria-label="Similar reports" className="overflow-hidden rounded-xl border bg-card shadow-xs">
              <h2 className="px-5 pt-5 pb-3 text-[15px] font-semibold">Similar reports</h2>
              <ul>
                {r.similar.map((s) => (
                  <li key={`${s.reference}-${s.reason}`} className="flex items-center justify-between gap-4 border-t px-5 py-3.5" data-similar={s.reference}>
                    <div className="flex min-w-0 flex-col">
                      <Link href={`/reports/${s.reference}`} className="truncate text-sm font-medium hover:underline">{s.summary}</Link>
                      <span className="font-mono text-xs text-muted-foreground">{s.reference}</span>
                    </div>
                    <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">{reasonLabel(s.reason)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Status history" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="text-[15px] font-semibold">Status history</h2>
            <ol className="flex flex-col gap-5">
              {r.history.map((h) => (
                <li key={h.key} className="flex gap-3" data-step={h.state}>
                  <span className={h.state === "done" ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-ok-border bg-ok-soft text-ok" : "mt-0.5 size-5 shrink-0 rounded-full border bg-background"}>
                    {h.state === "done" ? <CheckCircle2Icon className="size-3" aria-hidden /> : null}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className={h.state === "done" ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{h.label}</span>
                    {h.at ? <span className="text-xs text-muted-foreground">{stamp(h.at)}{h.note ? ` · ${h.note}` : ""}</span> : null}
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">{r.followers} {r.followers === 1 ? "person follows" : "people follow"} this report.</p>
          </section>

          <section aria-label="Attachments" className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="text-[15px] font-semibold">Attachments</h2>
            {r.attachments.length ? (
              <ul className="grid grid-cols-2 gap-3">
                {r.attachments.map((a) => (
                  <li key={a.id} className="overflow-hidden rounded-lg border bg-muted" data-attachment>
                    <Link href={`/evidence?item=${a.id}`} className="flex aspect-[4/3] items-center justify-center text-muted-foreground">
                      {a.link ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.link} alt={a.title} className="size-full object-cover object-top" />
                      ) : (
                        <ImageIcon className="size-5" aria-hidden />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{r.attachmentCount > 0 ? `${r.attachmentCount} ${r.attachmentCount === 1 ? "file is" : "files are"} attached. Only the reporter and moderators can open them.` : "No files were attached."}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ReportFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-72" /></div>
      <LoadingState text="Loading the report…" />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-60 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    </div>
  );
}

export default function ReportPage({ params }: Pick<PageProps<"/reports/[ref]">, "params">) {
  return (
    <Suspense fallback={<ReportFallback />}>
      <Report params={params} />
    </Suspense>
  );
}
