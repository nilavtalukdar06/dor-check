import { CoinsIcon } from "lucide-react";
import { LoadingState, CardSkeleton } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a comparison runs. */
export function ResultSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-6 rounded-xl border bg-card p-5 shadow-xs">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full" />
        <LoadingState text="Comparing your quote with the tariff range…" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[272px] rounded-xl" />
        <CardSkeleton lines={4} />
      </div>
    </div>
  );
}

/** Shown before the first comparison. */
export function EmptyResult({ notFound }: { notFound?: boolean }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border bg-soft">
        <CoinsIcon className="size-4 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium">
        {notFound ? "We could not find that comparison" : "No comparison yet"}
      </p>
      <p className="max-w-xs text-sm text-muted-foreground">
        {notFound
          ? "It may belong to another account. Run a new comparison on the left."
          : "Enter what you were quoted. We show the usual range and where your quote falls."}
      </p>
    </div>
  );
}
