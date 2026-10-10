import { AudioLinesIcon, MapPinOffIcon } from "lucide-react";
import Link from "next/link";
import { PriceRange } from "@/components/common/price-range";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDuration, rs } from "@/lib/format";
import { BAND_COPY, bandSubtitle } from "@/lib/price-present";
import { UNIT_LABELS } from "@/lib/price-schema";
import type { PriceCheckView } from "@/server/price-check";
import { RouteMapLazy } from "./route-map-lazy";

const toneBorder = {
  danger: "border-danger-border",
  warning: "border-warning-border",
  ok: "border-ok-border",
  info: "border-border",
} as const;

function ResultCard({ view }: { view: PriceCheckView }) {
  const copy = BAND_COPY[view.band];
  const hasRange = view.lowInr !== null && view.highInr !== null;
  const unit = view.unit ? UNIT_LABELS[view.unit] : null;

  return (
    <section
      aria-label="Price result"
      className={`overflow-hidden rounded-xl border bg-card shadow-xs ${toneBorder[copy.tone]}`}
    >
      <div className="flex flex-col gap-6 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] leading-7 font-semibold tracking-tight">{copy.title}</h2>
            <p className="text-sm text-muted-foreground">
              {bandSubtitle(view.band, view.percentOverHigh)}
            </p>
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
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t bg-soft px-5 py-3 text-xs text-muted-foreground">
        {hasRange ? (
          <>
            <span>
              Usual range {rs(view.lowInr!)} to {rs(view.highInr!)}
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

function RouteCard({ view }: { view: PriceCheckView }) {
  const { origin, destination } = view;
  const hasMap = origin.lat !== null && origin.lng !== null && destination?.lat != null && destination.lng != null;

  return (
    <section aria-label="Route" className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="h-[200px] bg-[#eef1ee]">
        {hasMap ? (
          <RouteMapLazy
            from={{ lat: origin.lat!, lng: origin.lng! }}
            to={{ lat: destination!.lat!, lng: destination!.lng! }}
            geometry={view.geometry}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <MapPinOffIcon className="size-5" />
            Pick both places from the list to see the route.
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
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
          {view.via ? `Via ${view.via}` : view.distanceIsApprox ? "Straight-line estimate (approx)" : "Road route"}
        </p>
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
        {view.band !== "NO_REFERENCE" ? <Badge variant="outline">Tariff sheet</Badge> : null}
        {view.communityReports > 0 ? (
          <Badge variant="outline">
            {view.communityReports} report{view.communityReports === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
      <div>
        {/* Wired to speech in the Read aloud phase. */}
        <Button variant="outline" size="sm" className="h-8 gap-2 shadow-xs" nativeButton={false} render={<Link href={`/voice?priceCheck=${view.id}`} />}>
          <AudioLinesIcon data-icon="inline-start" />
          Read aloud
        </Button>
      </div>
    </section>
  );
}

/** The right-hand column: verdict card, then route map and explanation. Server-rendered. */
export function PriceResultPanel({ view }: { view: PriceCheckView }) {
  const showRoute = view.service === "TAXI";
  return (
    <div className="flex flex-col gap-4">
      <ResultCard view={view} />
      <div className={showRoute ? "grid gap-4 md:grid-cols-2" : ""}>
        {showRoute ? <RouteCard view={view} /> : null}
        <WhyCard view={view} />
      </div>
    </div>
  );
}
