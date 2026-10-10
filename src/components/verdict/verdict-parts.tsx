import { AlertTriangleIcon, BuildingIcon, CheckIcon, CircleHelpIcon, LockIcon, PhoneIcon, SearchXIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { VerdictCore, VerdictSignal, VerdictSource } from "@/server/investigation-view";
import { cn } from "@/lib/utils";

const BANNER: Record<VerdictCore["verdict"], { label: string; tone: string; icon: typeof ShieldCheckIcon }> = {
  SUSPICIOUS: { label: "Suspicious", tone: "border-danger-border bg-danger-soft text-danger", icon: AlertTriangleIcon },
  VERIFIED_MATCH: { label: "Verified match", tone: "border-ok-border bg-ok-soft text-ok", icon: ShieldCheckIcon },
  NO_MATCH: { label: "No match found", tone: "border-border bg-soft text-foreground", icon: SearchXIcon },
  INCONCLUSIVE: { label: "Inconclusive", tone: "border-warning-border bg-warning-soft text-warning", icon: CircleHelpIcon },
};
const LEVEL = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;

/** Colour follows the verdict. Confidence and "not a legal finding" are always shown. */
export function VerdictBanner({ v }: { v: Pick<VerdictCore, "verdict" | "concern" | "confidence" | "summary"> }) {
  const b = BANNER[v.verdict];
  return (
    <section aria-label="Verdict" data-testid="verdict-banner" data-verdict={v.verdict} className={cn("flex gap-4 rounded-xl border p-5 sm:p-6", b.tone)}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-card">
        <b.icon className="size-5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{b.label}</h2>
          <span className="rounded-full border border-current/30 bg-card/60 px-2.5 py-0.5 text-xs font-medium">{LEVEL[v.concern]} concern</span>
          <span className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">Confidence: {LEVEL[v.confidence].toLowerCase()}</span>
        </div>
        <p className="max-w-3xl text-[15px] leading-relaxed text-foreground">{v.summary}</p>
      </div>
    </section>
  );
}

const SIGNAL_ICON = {
  RISK: { icon: XIcon, tone: "border-danger-border bg-danger-soft text-danger" },
  CAUTION: { icon: AlertTriangleIcon, tone: "border-warning-border bg-warning-soft text-warning" },
  POSITIVE: { icon: CheckIcon, tone: "border-ok-border bg-ok-soft text-ok" },
} as const;

const STRENGTH_LABEL = { STRONG: "Strong", MODERATE: "Moderate", WEAK: "Weak", NEUTRAL: "Neutral" } as const;

/** Red for a strong risk, amber for a moderate one, green for a good sign, grey when it barely matters. */
function pill(kind: VerdictSignal["kind"], strength: VerdictSignal["strength"]) {
  if (strength === "WEAK" || strength === "NEUTRAL") return "border-border bg-card text-muted-foreground";
  if (kind === "POSITIVE") return "border-ok-border bg-ok-soft text-ok";
  if (kind === "RISK" && strength === "STRONG") return "border-danger-border bg-danger-soft text-danger";
  return "border-warning-border bg-warning-soft text-warning";
}

export function SignalList({ signals }: { signals: VerdictSignal[] }) {
  return (
    <section aria-label="Why this was flagged" className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <h2 className="px-5 pt-5 pb-4 text-[15px] font-semibold">Why this was flagged</h2>
      {signals.length === 0 ? <p className="border-t px-5 py-5 text-sm text-muted-foreground">No specific signals were found.</p> : null}
      <ul>
        {signals.map((s) => {
          const I = SIGNAL_ICON[s.kind];
          return (
            <li key={s.id} className="flex items-start gap-3 border-t px-5 py-4" data-signal={s.kind}>
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", I.tone)}>
                <I.icon className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium">{s.title}</span>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{s.detail}</p>
                {s.sourceNos.length ? (
                  <p className="text-xs text-muted-foreground">
                    {s.sourceNos.length === 1 ? "Source" : "Sources"}{" "}
                    {s.sourceNos.map((n, i) => (
                      <span key={n}>
                        {i > 0 ? ", " : ""}
                        <a href={`#source-${n}`} className="underline underline-offset-2 hover:text-foreground">{n}</a>
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
              <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium", pill(s.kind, s.strength))}>{STRENGTH_LABEL[s.strength]}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function guidanceIcon(text: string) {
  if (/advance|deposit|personal/i.test(text)) return LockIcon;
  if (/1930|cybercrime|helpline|report/i.test(text)) return PhoneIcon;
  if (/verify|registered|official|directory|office/i.test(text)) return BuildingIcon;
  return CheckIcon;
}

/** Always opens with "do not pay an advance to a personal account" and carries 1930 and cybercrime.gov.in. */
export function GuidanceCard({ guidance }: { guidance: string[] }) {
  return (
    <section aria-label="What to do now" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
      <h2 className="text-[15px] font-semibold">What to do now</h2>
      <ul className="flex flex-col gap-3.5">
        {guidance.map((g) => {
          const I = guidanceIcon(g);
          return (
            <li key={g} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-soft text-muted-foreground">
                <I className="size-4" aria-hidden />
              </span>
              <span className="pt-1.5 text-sm leading-snug">{g}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const KIND_LABEL: Record<string, string> = { WEB_PAGE: "Web page", DIRECTORY: "Directory", TARIFF: "Tariff", ADVISORY: "Advisory", REPORT: "Community report", KNOWLEDGE: "Knowledge base", USER: "Your message" };
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const retrieved = (d: Date) =>
  dayKey(d) === dayKey(new Date())
    ? `retrieved ${new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d)}`
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

/** Every source with where it came from and when it was retrieved. A web address is a link; a report is a reference. */
export function SourcesCard({ sources }: { sources: VerdictSource[] }) {
  return (
    <section aria-label="Sources" className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <h2 className="px-5 pt-5 pb-4 text-[15px] font-semibold">Sources</h2>
      {sources.length === 0 ? <p className="border-t px-5 py-5 text-sm text-muted-foreground">No sources were cited.</p> : null}
      <ol>
        {sources.map((s) => (
          <li key={s.id} id={`source-${s.no}`} className="flex scroll-mt-20 items-baseline justify-between gap-4 border-t px-5 py-3.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{s.title}</span>
              {s.url && /^https?:\/\//i.test(s.url) ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate font-mono text-xs text-muted-foreground underline-offset-2 hover:underline">{s.url}</a>
              ) : (
                <span className="truncate font-mono text-xs text-muted-foreground">{s.url ?? s.label ?? KIND_LABEL[s.kind] ?? s.kind}</span>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground"><span className="mr-2 font-mono">{s.no}</span>{retrieved(s.retrievedAt)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Limitations({ text }: { text: string | null }): ReactNode {
  if (!text) return null;
  return (
    <section aria-label="What we could not check" className="flex flex-col gap-1.5 rounded-xl border bg-card p-5 shadow-xs">
      <h2 className="text-[15px] font-semibold">What we could not check</h2>
      <p className="text-sm text-muted-foreground">{text}</p>
    </section>
  );
}
