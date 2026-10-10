import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";

/** The chat pane while it loads: language chips, a couple of bubbles and the composer. */
export function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5 md:px-8" aria-busy="true">
      <div className="flex gap-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}</div>
      <LoadingState text="Loading your conversation…" />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
        <Skeleton className="h-11 w-2/3 self-end rounded-2xl" />
        <Skeleton className="h-24 w-4/5 rounded-2xl" />
      </div>
      <Skeleton className="mx-auto h-24 w-full max-w-3xl rounded-2xl" />
    </div>
  );
}
