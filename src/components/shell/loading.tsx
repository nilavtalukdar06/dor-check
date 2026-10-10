import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Spinner plus a sentence that says what is loading. Never a bare spinner. */
export function LoadingState({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <Spinner />
      <span>{text}</span>
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs", className)}>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-xl border bg-card shadow-xs">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex gap-6 border-b bg-soft px-5 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-6 border-b px-5 py-4 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 1 && "flex-[2]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ items = 6 }: { items?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

type Variant = "dashboard" | "table" | "grid" | "form" | "split";

/**
 * Skeleton for a whole page: heading placeholders, a caption naming what is loading,
 * then a body shaped like the real page.
 */
export function PageSkeleton({
  label,
  variant = "split",
}: {
  label: string;
  variant?: Variant;
}) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <LoadingState text={label} />
      {variant === "dashboard" && (
        <>
          <StatRowSkeleton />
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <ListSkeleton rows={4} />
            <CardSkeleton lines={4} />
          </div>
        </>
      )}
      {variant === "table" && (
        <>
          <Skeleton className="h-9 w-72" />
          <TableSkeleton />
        </>
      )}
      {variant === "grid" && (
        <>
          <Skeleton className="h-9 w-72" />
          <GridSkeleton />
        </>
      )}
      {variant === "form" && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <CardSkeleton lines={7} />
          <CardSkeleton lines={4} />
        </div>
      )}
      {variant === "split" && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={3} />
        </div>
      )}
    </div>
  );
}
