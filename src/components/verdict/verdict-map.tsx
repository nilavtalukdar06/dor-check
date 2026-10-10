"use client";

import type { MapMarker } from "@/components/map/mapbox-map";
import { MapboxMapLazy } from "@/components/map/mapbox-map-lazy";

/** Where the business is (or the district) and where matching reports come from. Hidden without a Mapbox token. */
export function VerdictMap({ markers, caption }: { markers: MapMarker[]; caption: string | null }) {
  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return null;
  return (
    <section aria-label="Map" className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="text-[15px] font-semibold">Map</h2>
        {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
      </div>
      <div className="h-52 border-t bg-[#eef1ee]">
        <MapboxMapLazy markers={markers} pitch={40} />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t px-5 py-3 text-xs text-muted-foreground">
        {markers.map((m) => (
          <li key={`${m.lat}-${m.lng}-${m.label}`} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: m.color }} aria-hidden />
            {m.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
