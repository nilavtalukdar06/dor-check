import { ArrowLeftRightIcon, ExternalLinkIcon, ShieldCheckIcon } from "lucide-react";
import { PriceRange } from "@/components/common/price-range";
import { Badge } from "@/components/ui/badge";
import { ListenButton } from "@/components/voice/listen-button";
import { formatDate, formatDuration, rs } from "@/lib/format";
import { BASIS_LABEL, bandCopy, bandSubtitle } from "@/lib/price-present";
import { UNIT_LABELS } from "@/lib/price-schema";
import type { PriceCheckView } from "@/server/price-check";
import { PlaceMap, RouteMap } from "./route-map";

const toneBorder = {
  danger: "border-danger-border",
  warning: "border-warning-border",
  ok: "border-ok-border",
  info: "border-border",
} as const;

function ResultCard({ view }: { view: PriceCheckView }) {
  const copy = bandCopy(view.band, view.basis);
  const hasRange = view.lowInr !== null && view.highInr !== null;
  const unit = view.unit ? UNIT_LABELS[view.unit] : null;

  return (
    <section aria-label="Price result" className={`overflow-hidden rounded-xl border bg-card shadow-xs ${toneBorder[copy.tone]}`}>
      <div className="flex flex-col gap-6 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] leading-7 font-semibold tracking-tight">{copy.title}</h2>
            <p className="text-sm text-muted-foreground">{bandSubtitle(view.band, view.percentOverHigh, view.basis)}</p>
            {view.basis ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheckIcon className="size-3.5" />
                {BASIS_LABEL[view.basis](view.sampleSize)}
              </p>
            ) : null}
          </div>
          <Badge variant={copy.tone}>{copy.badge}</Badge>
        </div>
        {hasRange ? (
          <PriceRange low={view.lowInr!} high={view.highInr!} quote={view.quotedInr} />
        ) : (
          <p className="text-sm">
            You were quoted <span className="font-semibold">{rs(view.quotedInr)}</span>.
          </p>
        )}
        {view.reversed ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeftRightIcon className="size-3.5" />
            Tariff written for the opposite direction. Fares are the same both ways.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t bg-soft px-5 py-3 text-xs text-muted-foreground">
        {hasRange ? (
          <>
            <span>
              {view.basis === "estimated" ? "Estimated range" : "Usual range"} {rs(view.lowInr!)} to {rs(view.highInr!)}
              {unit ? ` ${unit}` : ""}
            </span>
            <span>
              {view.sourceLabel ?? "Tariff"}
              {view.effectiveOn ? ` · updated ${formatDate(view.effectiveOn)}` : ""}
            </span>
          </>
        ) : (
          <span>Signal only. Not a legal finding.</span>
        )}
      </div>
    </section>
  );
}

function MapCard({ view }: { view: PriceCheckView }) {
  const { origin, destination } = view;
  const taxi = view.service === "TAXI";
  const fromOk = origin.lat !== null && origin.lng !== null;
  const toOk = destination?.lat != null && destination.lng != null;

  return (
    <section aria-label={taxi ? "Route" : "Location"} className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="h-[240px] bg-[#eef1ee]">
        {taxi && fromOk && toOk ? (
          <RouteMap from={{ lat: origin.lat!, lng: origin.lng! }} to={{ lat: destination!.lat!, lng: destination!.lng! }} geometry={view.geometry} />
        ) : !taxi && fromOk ? (
          <PlaceMap at={{ lat: origin.lat!, lng: origin.lng! }} />
        ) : (
          <div className="flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            We couldn&apos;t find that place on the map.
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        {taxi ? (
          <>
            <p className="text-sm font-semibold">
              {view.distanceKm !== null ? (
                <>
                  Route · {view.distanceIsApprox ? "about " : ""}
                  {view.distanceKm} km
                  {view.durationMin !== null ? ` · about ${formatDuration(view.durationMin)}` : ""}
                </>
              ) : (
                "Route"
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {view.via ? `Via ${view.via}` : view.distanceIsApprox ? "Straight-line estimate (approx)" : "Road route with live traffic"}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">{origin.name}</p>
            <p className="text-xs text-muted-foreground">{view.qualifier ?? "Location"}</p>
          </>
        )}
      </div>
    </section>
  );
}

function WhyCard({ view }: { view: PriceCheckView }) {
  return (
    <section aria-label="Why this range" className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
      <h3 className="text-base font-semibold">{view.band === "NO_REFERENCE" ? "Why there is no range" : "Why this range"}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{view.explanation}</p>
      <div className="flex flex-wrap gap-2">
        {view.basis === "curated" ? <Badge variant="outline">Tariff sheet</Badge> : null}
        {view.basis === "researched" ? <Badge variant="outline">{view.sources.length} sources</Badge> : null}
        {view.basis === "estimated" ? <Badge variant="outline">Distance estimate</Badge> : null}
        {view.communityReports > 0 ? (
          <Badge variant="outline">
            {view.communityReports} report{view.communityReports === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
      <div>
        {view.explanation ? <ListenButton text={view.explanation} title={`Price check · ${view.band === "NO_REFERENCE" ? "no reference" : "fair range"}`} /> : null}
      </div>
    </section>
  );
}

function SourcesCard({ view }: { view: PriceCheckView }) {
  if (view.sources.length === 0) return null;
  return (
    <section aria-label="Sources" className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h3 className="text-base font-semibold">Sources</h3>
        <span className="text-xs text-muted-foreground">Each price was found on its page</span>
      </div>
      <ul className="divide-y">
        {view.sources.map((s) => (
          <li key={`${s.url}-${s.valueInr}`} className="flex flex-col gap-1.5 px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1.5 text-sm font-medium hover:underline">
                <span className="truncate">{s.title || s.domain}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
              {s.valueInr !== null ? <span className="shrink-0 text-sm font-semibold">{rs(s.valueInr)}</span> : null}
            </div>
            {s.quote ? <p className="line-clamp-2 text-xs text-muted-foreground">&ldquo;{s.quote}&rdquo;</p> : null}
            <p className="font-mono text-[11px] text-muted-foreground">
              {s.domain} · retrieved {formatDate(s.retrievedAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The right-hand column: verdict card, map, explanation and sources. Server-rendered. */
export function PriceResultPanel({ view }: { view: PriceCheckView }) {
  return (
    <div className="flex flex-col gap-4">
      <ResultCard view={view} />
      <div className="grid gap-4 md:grid-cols-2">
        <MapCard view={view} />
        <WhyCard view={view} />
      </div>
      <SourcesCard view={view} />
    </div>
  );
}
