import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingState } from "@/components/shell/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getVerdictView, type VerdictView } from "@/server/investigation-view";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Verdict" };

const BANNER: Record<VerdictView["verdict"], { label: string; tone: string }> = {
  SUSPICIOUS: { label: "Suspicious", tone: "border-danger-border bg-danger-soft text-danger" },
  VERIFIED_MATCH: { label: "Verified match", tone: "border-ok-border bg-ok-soft text-ok" },
  NO_MATCH: { label: "No match found", tone: "border-info-border bg-info-soft text-info" },
  INCONCLUSIVE: { label: "Inconclusive", tone: "border-warning-border bg-warning-soft text-warning" },
};
const LEVEL = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;
const SIGNAL_TONE = { RISK: "danger", CAUTION: "warning", POSITIVE: "ok" } as const;
const SIGNAL_LABEL = { RISK: "Risk", CAUTION: "Caution", POSITIVE: "Positive" } as const;
const KIND_LABEL: Record<string, string> = { WEB_PAGE: "Web page", DIRECTORY: "Directory", TARIFF: "Tariff", ADVISORY: "Advisory", REPORT: "Community report", KNOWLEDGE: "Knowledge base", USER: "Your message" };

const stamp = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(d);

async function Verdict({ params }: Pick<PageProps<"/investigate/[id]/verdict">, "params">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const v = await getVerdictView(user.id, id);
  if (!v) notFound();
  const banner = BANNER[v.verdict];
  const sourceNo = new Map(v.sources.map((s, i) => [s.id, i + 1]));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/investigate" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-3.5" aria-hidden /> New investigation
      </Link>

      <section className={`flex flex-col gap-3 rounded-xl border p-5 sm:p-6 ${banner.tone}`} aria-label="Verdict" data-testid="verdict-banner" data-verdict={v.verdict}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{banner.label}</h1>
          <span className="rounded-full border border-current/30 px-2.5 py-0.5 text-xs font-medium">Concern: {LEVEL[v.concern]}</span>
          <span className="rounded-full border border-current/30 px-2.5 py-0.5 text-xs font-medium">Confidence: {LEVEL[v.confidence]}</span>
        </div>
        <p className="font-mono text-sm opacity-80">{v.title}</p>
        <p className="max-w-3xl text-[15px] leading-relaxed text-foreground">{v.summary}</p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Why this was flagged" className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <h2 className="px-5 pt-5 pb-3 text-[15px] font-semibold">What we found</h2>
            {v.signals.length === 0 ? <p className="border-t px-5 py-5 text-sm text-muted-foreground">No specific signals were found.</p> : null}
            <ul>
              {v.signals.map((s) => (
                <li key={s.id} className="flex flex-col gap-1.5 border-t px-5 py-4" data-signal={s.kind}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={SIGNAL_TONE[s.kind]}>{SIGNAL_LABEL[s.kind]}</Badge>
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-xs text-muted-foreground">{s.strength.toLowerCase()}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.detail}</p>
                  {s.sourceId && sourceNo.get(s.sourceId) ? <a href={`#source-${sourceNo.get(s.sourceId)}`} className="w-fit text-xs underline underline-offset-2">Source {sourceNo.get(s.sourceId)}</a> : null}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Sources" className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <h2 className="px-5 pt-5 pb-3 text-[15px] font-semibold">Sources</h2>
            <ol>
              {v.sources.map((s, i) => (
                <li key={s.id} id={`source-${i + 1}`} className="flex flex-col gap-0.5 border-t px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-xs text-muted-foreground">{KIND_LABEL[s.kind] ?? s.kind}</span>
                  </div>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {s.url ? s.url : s.label ?? "—"} · retrieved {stamp(s.retrievedAt)} IST
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="What to do now" className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="text-[15px] font-semibold">What to do now</h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              {v.guidance.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ol>
          </section>
          {v.limitations ? (
            <section aria-label="What we could not check" className="flex flex-col gap-1.5 rounded-xl border bg-card p-5 shadow-xs">
              <h2 className="text-[15px] font-semibold">What we could not check</h2>
              <p className="text-sm text-muted-foreground">{v.limitations}</p>
            </section>
          ) : null}
          <Button variant="outline" className="h-10 shadow-xs" nativeButton={false} render={<Link href="/investigate" />}>
            Check something else
          </Button>
        </div>
      </div>
    </div>
  );
}

function VerdictFallback() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingState text="Loading the verdict…" />
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

export default function VerdictPage({ params }: Pick<PageProps<"/investigate/[id]/verdict">, "params">) {
  return (
    <Suspense fallback={<VerdictFallback />}>
      <Verdict params={params} />
    </Suspense>
  );
}
