import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** This month's investigations. `limit` is null on an unlimited plan; `used` is null while it loads. */
export function UsageCard({ used, limit }: { used: number | null; limit: number | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-3.5 shadow-xs">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Current usage</span>
        <span className="text-[13px] text-muted-foreground">Investigations this month</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight" data-testid="usage-card-number">
        {used ?? "–"} <span className="text-sm font-normal text-muted-foreground">/ {limit ?? (used === null ? "–" : "unlimited")}</span>
      </p>
      <Progress value={used !== null && limit ? Math.min(100, (used / limit) * 100) : 0} className="gap-0 [&_[data-slot=progress-track]]:h-1.5" />
      <Button variant="outline" size="sm" className="h-8 w-full shadow-xs" nativeButton={false} render={<Link href="/settings/plan" />}>
        Manage plan
      </Button>
    </div>
  );
}
