"use client";

import { MapboxMapLazy } from "@/components/map/mapbox-map-lazy";

type Point = { lat: number; lng: number };

/** Route card map: green start, red end, blue road line (dashed when only a straight line is known). */
export function RouteMap({ from, to, geometry }: { from: Point; to: Point; geometry: [number, number][] | null }) {
  return (
    <MapboxMapLazy
      markers={[
        { ...from, color: "#16a34a", label: "Start" },
        { ...to, color: "#dc2626", label: "End" },
      ]}
      line={geometry ?? [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ]}
      dashed={!geometry}
    />
  );
}

/** A single place (stays, guides, tours). */
export function PlaceMap({ at }: { at: Point }) {
  return <MapboxMapLazy markers={[{ ...at, color: "#dc2626" }]} pitch={45} />;
}
