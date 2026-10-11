import { InfoIcon, IndianRupeeIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RefreshWhileRunning } from "@/components/dashboard/refresh-while-running";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { getAdvisories, getDashboardStats, getDemoNotice, getRecentInvestigations } from "@/server/dashboard";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Dashboard" };

const when = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);
const day = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

const ACTIONS = [
  { href: "/investigate", title: "Check a booking", text: "Link, name or pasted message", orb: "from-indigo-300 to-violet-500" },
  { href: "/price", title: "Check a price", text: "Compare a quote with a range", orb: "from-yellow-200 to-amber-400" },
  { href: "/assistant", title: "Ask the assistant", text: "Assamese, Hindi or English", orb: "from-emerald-200 to-green-500" },
  { href: "/reports/new", title: "Report an incident", text: "Type it or say it aloud", orb: "from-rose-200 to-red-500" },
] as const;

function Card({ className = "", children, ...rest }: React.ComponentProps<"section">) {
  return <section className={`rounded-xl border bg-card shadow-xs ${className}`} {...rest}>{children}</section>;
}

async function Stats({ userId }: { userId: string }) {
  const s = await getDashboardStats(userId);
  const items = [
    { label: "Investigations", value: s.investigations },
    { label: "Suspicious found", value: s.suspicious },
    { label: "Reports followed", value: s.reportsFollowed },
    { label: "Evidence captures", value: s.evidence },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="stats">
      {items.map((i) => (
        <Card key={i.label} className="flex flex-col gap-3 p-5" data-stat={i.label}>
          <span className="text-[13px] text-muted-foreground">{i.label}</span>
          <span className="text-3xl font-semibold tracking-tight">{i.value}</span>
        </Card>
      ))}
    </div>
  );
}

async function Recent({ userId }: { userId: string }) {
  const rows = await getRecentInvestigations(userId);
  return (
    <>
      <RefreshWhileRunning active={rows.some((r) => r.running)} />
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border-t px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">You haven&apos;t checked anything yet. Paste a booking link or a quote to start.</p>
          <Button size="sm" nativeButton={false} render={<Link href="/investigate" />}>Check a booking</Button>
        </div>
      ) : (
        <ul data-testid="recent">
          {rows.map((r) => (
            <li key={r.id} className="border-t" data-recent={r.id}>
              <Link href={r.href} className="flex items-center gap-3.5 px-5 py-4 outline-none hover:bg-soft focus-visible:bg-soft">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground" aria-hidden>
                  {r.running ? <Spinner /> : r.kind === "PRICE" ? <IndianRupeeIcon className="size-4" /> : <SearchIcon className="size-4" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{r.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {r.running ? `Step ${Math.min(r.running.stepsDone + 1, r.running.totalSteps)} of ${r.running.totalSteps}${r.running.latest ? ` · ${r.running.latest}` : ""}` : `${r.kind === "PRICE" ? "Price" : "Booking"} · ${when(r.at)}`}
                  </span>
                </span>
                {r.running ? <Badge variant="info">Running</Badge> : r.badge ? <Badge variant={r.badge.tone}>{r.badge.label}</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function Advisories() {
  // Which advisories are still current depends on today's date.
  await connection();
  const [rows, demo] = await Promise.all([getAdvisories(), getDemoNotice()]);
  return (
    <>
      <Card className="overflow-hidden" aria-label="Regional advisories">
        <div className="flex flex-col gap-0.5 px-5 pt-5 pb-4">
          <h2 className="text-[15px] font-semibold">Regional advisories</h2>
          <p className="text-[13px] text-muted-foreground">From the knowledge base, with source and date</p>
        </div>
        {rows.length === 0 ? (
          <p className="border-t px-5 py-6 text-sm text-muted-foreground">No advisories right now.</p>
        ) : (
          <ul data-testid="advisories">
            {rows.map((a) => {
              const body = (
                <>
                  <span className="text-sm font-medium">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{a.label} · {day(a.date)}</span>
                </>
              );
              return (
                <li key={a.id} className="border-t">
                  {a.href ? (
                    <a href={a.href} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1 px-5 py-3.5 outline-none hover:bg-soft focus-visible:bg-soft">{body}</a>
                  ) : (
                    <div className="flex flex-col gap-1 px-5 py-3.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {demo ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-info-border bg-info-soft px-4 py-3 text-info" role="note">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="text-[13px]">{demo}</span>
        </div>
      ) : null}
    </>
  );
}

async function Welcome() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const first = (user.displayName ?? user.name ?? "").trim().split(/\s+/)[0];
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{first ? `Welcome back, ${first}` : "Welcome back"}</h1>
        <p className="text-[15px] text-muted-foreground">Verify a booking, compare a fare or ask the assistant. Every result shows its evidence.</p>
      </div>

      <nav aria-label="Quick actions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs outline-none transition-colors hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50" data-action={a.href}>
            <span aria-hidden className={`size-10 rounded-full bg-gradient-to-br shadow-inner ${a.orb}`} />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{a.title}</span>
              <span className="text-[13px] text-muted-foreground">{a.text}</span>
            </span>
          </Link>
        ))}
      </nav>

      <Suspense fallback={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>}>
        <Stats userId={user.id} />
      </Suspense>

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="overflow-hidden" aria-label="Recent investigations">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[15px] font-semibold">Recent investigations</h2>
              <p className="text-[13px] text-muted-foreground">Live runs update as each step finishes</p>
            </div>
            <Button variant="outline" size="sm" className="shadow-xs" nativeButton={false} render={<Link href="/investigate" />}>New</Button>
          </div>
          <Suspense fallback={<div className="flex flex-col gap-3 border-t p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>}>
            <Recent userId={user.id} />
          </Suspense>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
            <Advisories />
          </Suspense>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6" data-testid="dashboard">
      <Suspense fallback={<div className="flex flex-col gap-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-96" /></div>}>
        <Welcome />
      </Suspense>
    </div>
  );
}
