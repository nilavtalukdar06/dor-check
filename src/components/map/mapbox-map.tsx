"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type MapMarker = { lat: number; lng: number; color: string; label?: string };

/**
 * Interactive 3D Mapbox map (pitched view with terrain). Shared by the price route card and
 * the Explore map. Load it with next/dynamic and ssr: false.
 */
export default function MapboxMap({
  markers,
  line,
  dashed = false,
  className,
  pitch = 55,
}: {
  markers: MapMarker[];
  /** [lat, lng] points for a route line. */
  line?: [number, number][] | null;
  dashed?: boolean;
  className?: string;
  pitch?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const key = JSON.stringify([markers, line, dashed, pitch]);

  useEffect(() => {
    if (!container.current || !token) return;
    const points: [number, number][] = [...markers.map((m) => [m.lng, m.lat] as [number, number]), ...(line ?? []).map(([lat, lng]) => [lng, lat] as [number, number])];
    if (points.length === 0) return;

    const bounds = points.reduce((b, p) => b.extend(p), new mapboxgl.LngLatBounds(points[0], points[0]));
    const map = new mapboxgl.Map({
      accessToken: token,
      container: container.current,
      style: "mapbox://styles/mapbox/standard",
      bounds,
      fitBoundsOptions: { padding: 48, maxZoom: 13 },
      pitch,
      bearing: -12,
      cooperativeGestures: true,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    for (const m of markers) {
      const marker = new mapboxgl.Marker({ color: m.color }).setLngLat([m.lng, m.lat]);
      if (m.label) marker.setPopup(new mapboxgl.Popup({ offset: 24, closeButton: false }).setText(m.label));
      marker.addTo(map);
    }

    map.on("style.load", () => {
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
      }
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.4 });
      if (line && line.length > 1) {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line.map(([lat, lng]) => [lng, lat]) } },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          slot: "top",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#2563eb",
            "line-width": 4,
            "line-opacity": 0.9,
            ...(dashed ? { "line-dasharray": [2, 2] } : {}),
          },
        });
      }
    });

    return () => map.remove();
    // `key` captures every input that should rebuild the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token]);

  if (!token) {
    return (
      <div className={cn("flex size-full items-center justify-center p-4 text-center text-sm text-muted-foreground", className)}>
        Map unavailable: the Mapbox token is not configured.
      </div>
    );
  }
  return <div ref={container} className={cn("size-full", className)} aria-label="Map" role="region" />;
}
