import { CheckIcon } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getRole } from "@/server/roles";
import { getPlanPage, getUsageSummary } from "@/server/settings";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Plan and usage" };

const rs = (n: number) => `Rs ${n.toLocaleString("en-IN")}`;
const month = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d) : "–");
const INVOICE_VARIANT = { PAID: "ok", OPEN: "info", FAILED: "danger", REFUNDED: "outline", VOID: "outline" } as const;

function Meter({ label, used, limit, unit }: { label: string; used: number; limit: number | null; unit?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs" aria-label={label} data-meter={label}>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tracking-tight">{used.toLocaleString("en-IN")}{limit !== null ? ` / ${limit.toLocaleString("en-IN")}` : ""}{unit ? <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span> : null}</span>
      <Progress value={limit ? Math.min(100, (used / limit) * 100) : 0} className="gap-0 [&_[data-slot=progress-track]]:h-1.5" />
      {limit === null ? <span className="-mt-1 text-xs text-muted-foreground">No limit on your plan</span> : null}
    </section>
  );
}

async function Body() {
  const user = await getCurrentUser();
  if (!user) return null;
  const role = (await getRole()) ?? "TRAVELLER";
  const [usage, page] = await Promise.all([getUsageSummary(user.id, role), getPlanPage(user.id)]);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3" data-testid="meters">
        <Meter label="Investigations" used={usage.investigations.used} limit={usage.investigations.limit} />
        <Meter label="Voice minutes" used={usage.voiceMinutes.used} limit={usage.voiceMinutes.limit} />
        <Meter label="Evidence storage" used={usage.storageMb.used} limit={usage.storageMb.limit} unit="MB" />
      </div>

      <div className="grid gap-4 md:grid-cols-3" data-testid="plans">
        {page.plans.map((p) => {
          const current = p.tier === page.currentTier;
          return (
            <section key={p.id} aria-label={`${p.name} plan`} data-plan={p.tier} data-current={current} className={cn("flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs", current && "border-foreground ring-1 ring-foreground")}>
              <div className="flex items-center gap-2"><h2 className="text-[15px] font-semibold">{p.name}</h2>{current ? <Badge variant="info">Current</Badge> : null}</div>
              <p className="text-3xl font-semibold tracking-tight">{rs(p.priceInr)} <span className="text-sm font-normal text-muted-foreground">/ {p.billingPeriod}</span></p>
              <ul className="flex flex-col gap-2 text-sm">
                {p.features.map((f) => <li key={f} className="flex items-center gap-2"><CheckIcon className="size-4 shrink-0" aria-hidden />{f}</li>)}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="-mt-2 text-[13px] text-muted-foreground">Billing is not connected in this build, so plans are shown for reference. The free tier covers the core checks.</p>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs" aria-label="Invoices">
        <h2 className="border-b px-5 py-4 text-[15px] font-semibold">Invoices</h2>
        {page.invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground" data-testid="no-invoices">No invoices yet.</p>
        ) : (
          <ul>
            {page.invoices.map((i) => (
              <li key={i.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-5 py-4 text-sm last:border-b-0 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <span>{month(i.paidAt ?? i.periodStart ?? i.createdAt)}</span>
                <span className="hidden sm:block">{i.plan?.name ?? "–"}</span>
                <span className="hidden sm:block">{rs(i.amountInr)}</span>
                <Badge variant={INVOICE_VARIANT[i.status]}>{i.status.charAt(0) + i.status.slice(1).toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function PlanPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan and usage" description="Optional billing through Clerk. The free tier covers the core checks." />
      <Suspense fallback={<div className="flex flex-col gap-4"><div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div><Skeleton className="h-64 rounded-xl" /></div>}>
        <Body />
      </Suspense>
    </div>
  );
}
