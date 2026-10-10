"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { LocateFixedIcon, MinusIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KIND_COLOR, NE_BOUNDS, type Bbox, type MapSignal } from "@/lib/map";

export type ExploreMapHandle = {
  /** Fit the view to these points (used after a search). */
  fitTo: (points: { lat: number; lng: number }[]) => void;
  /** Fly to a signal and open its card. */
  focus: (signal: MapSignal) => void;
};

export type MapView = { bbox: Bbox; center: { lat: number; lng: number }; zoom: number };

/**
 * Interactive 3D map for the Explore screen. Pins are kept in sync with `signals`; moving the
 * map reports the new view so the parent can fetch what is in it.
 */
export default function ExploreMap({
  signals,
  selectedId,
  onSelect,
  onViewChange,
  ref,
}: {
  signals: MapSignal[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onViewChange: (view: MapView) => void;
  ref?: Ref<ExploreMapHandle>;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef(new Map<string, mapboxgl.Marker>());
  const popup = useRef<mapboxgl.Popup | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** Becomes true once the person pans or zooms; until then the opening view is re-framed on resize. */
  const userMoved = useRef(false);

  // Latest callbacks without rebuilding the map.
  const callbacks = useRef({ onSelect, onViewChange });
  useEffect(() => {
    callbacks.current = { onSelect, onViewChange };
  });

  const emitView = () => {
    const m = map.current;
    if (!m) return;
    const b = m.getBounds();
    if (!b) return;
    const c = m.getCenter();
    callbacks.current.onViewChange({
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      center: { lat: c.lat, lng: c.lng },
      zoom: m.getZoom(),
    });
  };

  // Build the map once.
  useEffect(() => {
    if (!container.current || !token || map.current) return;
    const m = new mapboxgl.Map({
      accessToken: token,
      container: container.current,
      style: "mapbox://styles/mapbox/standard",
      bounds: NE_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      // Flat enough that the whole region is framed; it tilts when you zoom to a pin or a search.
      pitch: 20,
      bearing: 0,
      attributionControl: true,
    });
    map.current = m;
    m.on("style.load", () => {
      m.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
      m.setTerrain({ source: "mapbox-dem", exaggeration: 1.4 });
      setReady(true);
    });
    m.on("movestart", (e) => {
      if (e.originalEvent) userMoved.current = true;
    });
    m.on("moveend", emitView);

    // The container can change size after the map is created (layout settling, the list
    // loading, a resized window). Mapbox does not notice by itself: tell it, and re-frame the
    // region if nobody has moved the map yet.
    const observer = new ResizeObserver(() => {
      m.resize();
      if (!userMoved.current) m.fitBounds(NE_BOUNDS, { padding: 24, animate: false, pitch: 20, bearing: 0 });
    });
    observer.observe(container.current);
    m.once("load", emitView);
    m.on("click", () => callbacks.current.onSelect(null));
    const pins = markers.current;
    return () => {
      observer.disconnect();
      pins.forEach((p) => p.remove());
      pins.clear();
      m.remove();
      map.current = null;
    };
    // The map is created once for this token; emitView reads refs only.
  }, [token]);

  // Keep the pins in step with the data.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const pins = markers.current;
    const wanted = new Set(signals.map((s) => s.id));
    for (const [id, marker] of pins) {
      if (!wanted.has(id)) {
        marker.remove();
        pins.delete(id);
      }
    }
    for (const s of signals) {
      const existing = pins.get(s.id);
      if (existing) {
        existing.setLngLat([s.lng, s.lat]);
        continue;
      }
      const marker = new mapboxgl.Marker({ color: KIND_COLOR[s.kind], scale: 0.85 }).setLngLat([s.lng, s.lat]);
      const el = marker.getElement();
      el.style.cursor = "pointer";
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${s.badge}: ${s.title}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.current.onSelect(s.id);
      });
      marker.addTo(m);
      pins.set(s.id, marker);
    }
  }, [signals, ready]);

  // The card's container is created per selection (this component only renders in the browser).
  const popupNode = useMemo(() => (selectedId ? document.createElement("div") : null), [selectedId]);

  // Show the card for the selected pin.
  useEffect(() => {
    const m = map.current;
    const s = signals.find((x) => x.id === selectedId);
    if (!m || !s || !popupNode) return;
    const p = new mapboxgl.Popup({ offset: 26, closeButton: false, maxWidth: "280px" })
      .setLngLat([s.lng, s.lat])
      .setDOMContent(popupNode)
      .addTo(m);
    popup.current = p;
    for (const [id, marker] of markers.current) marker.getElement().style.zIndex = id === s.id ? "5" : "";
    return () => {
      p.remove();
      popup.current = null;
    };
    // `signals` is read once per selection; re-running on every refresh would flicker the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, popupNode]);

  useImperativeHandle(ref, () => ({
    fitTo(points) {
      const m = map.current;
      if (!m || points.length === 0) return;
      const b = points.reduce((bb, p) => bb.extend([p.lng, p.lat]), new mapboxgl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat]));
      m.fitBounds(b, { padding: 80, maxZoom: 12, pitch: 50, duration: 900 });
    },
    focus(s) {
      map.current?.flyTo({ center: [s.lng, s.lat], zoom: Math.max(map.current.getZoom(), 10.5), pitch: 55, duration: 900 });
    },
  }));

  const selected = signals.find((x) => x.id === selectedId);

  if (!token) {
    return (
      <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        The map is unavailable: the Mapbox token is not configured.
      </div>
    );
  }

  return (
    <div className="relative size-full">
      {/* Mapbox's own CSS forces its element to position: relative, so the sizing wrapper is separate. */}
      <div className="absolute inset-0">
        <div ref={container} className="size-full" role="region" aria-label="Map of reports, properties and tariff boards" />
      </div>
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button variant="outline" size="icon" className="bg-background shadow-sm" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <PlusIcon />
        </Button>
        <Button variant="outline" size="icon" className="bg-background shadow-sm" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <MinusIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-background shadow-sm"
          aria-label="Show my location"
          onClick={() => {
            setLocateError(null);
            if (!("geolocation" in navigator)) return setLocateError("Your browser cannot share a location.");
            navigator.geolocation.getCurrentPosition(
              (pos) => map.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 11, duration: 900 }),
              () => setLocateError("Location is blocked. Allow it in your browser to centre the map on you."),
              { timeout: 8000 },
            );
          }}
        >
          <LocateFixedIcon />
        </Button>
      </div>
      {locateError ? (
        <p role="status" className="absolute right-4 bottom-8 left-4 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm sm:left-auto sm:max-w-xs">
          {locateError}
        </p>
      ) : null}
      {popupNode && selected
        ? createPortal(
            <div className="flex flex-col gap-1.5 p-1 text-foreground">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm leading-snug font-semibold">{selected.title}</p>
                <Badge variant="outline">{selected.badge}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{selected.subtitle}</p>
              <Link href={selected.href} className="mt-1 text-xs font-medium underline underline-offset-2">
                {selected.layer === "reports" ? "Open report" : selected.layer === "properties" ? "Open in directory" : "Check a price"}
              </Link>
            </div>,
            popupNode,
          )
        : null}
    </div>
  );
}
