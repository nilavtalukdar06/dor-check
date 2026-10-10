import { FlagIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AskDock } from "@/components/verdict/ask-dock";
import { ExportButton, ShareButton } from "@/components/verdict/verdict-actions";
import { ListenButton } from "@/components/voice/listen-button";
import { verdictSpeech } from "@/lib/voice";
import { VerdictMap } from "@/components/verdict/verdict-map";
import { GuidanceCard, Limitations, SignalList, SourcesCard, VerdictBanner } from "@/components/verdict/verdict-parts";
import { EvidenceCard } from "@/components/investigation/evidence-card";
import { LoadingState } from "@/components/shell/loading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStamp } from "@/lib/evidence";
import { getVerdictView } from "@/server/investigation-view";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Verdict" };

const KIND_NAME: Record<string, string> = { LINK: "Booking", BUSINESS_NAME: "Business", MESSAGE: "Message", CONTACT: "Contact" };
const when = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d).replace(",", ",");

async function Verdict({ params }: Pick<PageProps<"/investigate/[id]/verdict">, "params">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const v = await getVerdictView(user.id, id);
  if (!v) notFound();

  return (
    <div className="flex flex-col gap-6" data-testid="verdict-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight break-words">{v.title}</h1>
          <p className="text-[15px] text-muted-foreground">
            {KIND_NAME[v.inputType] ?? "Booking"} investigation · {when(v.completedAt ?? v.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <ListenButton text={verdictSpeech({ title: v.title, concern: v.concern, summary: v.summary, guidance: v.guidance })} title={`Verdict · ${v.title}`} source={{ investigationId: v.id }} />
          <ExportButton />
          <ShareButton id={v.id} isPublic={v.share.isPublic} token={v.share.token} />
          <Button className="h-10 gap-2 px-4" nativeButton={false} render={<Link href={`/reports/new?investigation=${v.id}`} />}>
            <FlagIcon data-icon="inline-start" />
            Report this
          </Button>
        </div>
      </div>

      <VerdictBanner v={v} />

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <SignalList signals={v.signals} />

          <section aria-label="Evidence captured" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Evidence captured</h2>
              <Link href="/evidence" className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline print:hidden">Open vault</Link>
            </div>
            {v.evidence.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card px-5 py-6 text-sm text-muted-foreground">No page was captured for this check, so there is no screenshot. You can capture one from the Evidence vault.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {v.evidence.map((e) => (
                  <li key={e.id} className="flex">
                    <EvidenceCard className="w-full" href={`/evidence?item=${e.id}`} title={e.title} subject={e.capturedBy} timestamp={formatStamp(e.capturedAt)} kind={e.kind.toLowerCase() as "screenshot" | "extract" | "upload" | "audio" | "document"} thumbnailUrl={e.thumbnail} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <SourcesCard sources={v.sources} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <GuidanceCard guidance={v.guidance} />
          {v.map ? <VerdictMap markers={v.map.markers} caption={v.map.caption} /> : null}
          <Limitations text={v.limitations} />
          <div className="print:hidden">
            <AskDock investigationId={v.id} />
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">This result is a signal backed by sources, not a legal finding. For urgent fraud call 1930 or use cybercrime.gov.in.</p>
    </div>
  );
}

function VerdictFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
      <LoadingState text="Loading the verdict…" />
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
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
