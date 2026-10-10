import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";

export function VoiceSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy="true">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-80" /></div>
        <LoadingState text="Loading read aloud…" />
        <Skeleton className="h-72 rounded-xl" />
        <div className="flex gap-3"><Skeleton className="h-10 w-44 rounded-lg" /><Skeleton className="h-10 w-40 rounded-lg" /><Skeleton className="ml-auto h-10 w-40 rounded-lg" /></div>
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
