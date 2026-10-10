import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingState } from "@/components/shell/loading";
import { GuidanceCard, Limitations, SignalList, SourcesCard, VerdictBanner } from "@/components/verdict/verdict-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { getSharedVerdict } from "@/server/investigation-view";

// A shared link is for the people it was sent to, not for search engines.
export const metadata: Metadata = { title: "Shared verdict", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function Shared({ params }: Pick<PageProps<"/share/[token]">, "params">) {
  const { token } = await params;
  const v = await getSharedVerdict(token);
  if (!v) notFound();
  return (
    <div className="flex flex-col gap-6" data-testid="shared-verdict">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[28px] leading-9 font-semibold tracking-tight break-words">{v.title}</h1>
        <p className="text-[15px] text-muted-foreground">Checked with Travel Trap Detector{v.completedAt ? ` · ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(v.completedAt)}` : ""}</p>
      </div>
      <VerdictBanner v={v} />
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <SignalList signals={v.signals} />
          <SourcesCard sources={v.sources} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <GuidanceCard guidance={v.guidance} />
          <Limitations text={v.limitations} />
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">This result is a signal backed by sources, not a legal finding. For urgent fraud call 1930 or use cybercrime.gov.in.</p>
    </div>
  );
}

export default function SharedPage({ params }: Pick<PageProps<"/share/[token]">, "params">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <LoadingState text="Loading the verdict…" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      }
    >
      <Shared params={params} />
    </Suspense>
  );
}
