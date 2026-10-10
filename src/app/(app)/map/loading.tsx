import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="-mx-4 -mt-6 -mb-24 h-[calc(100svh-3.5rem)] md:-mx-8 md:-mt-8 md:-mb-8" aria-busy="true">
      <div className="flex size-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative flex-1 p-0 lg:p-6">
          <Skeleton className="size-full lg:rounded-2xl" />
          <LoadingState text="Loading the map…" className="absolute inset-0 justify-center" />
        </div>
        <div className="hidden flex-col gap-3 border-l p-5 lg:flex">
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="size-3 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
