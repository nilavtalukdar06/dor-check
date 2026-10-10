"use client";

import { ChevronUpIcon, FilterIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingState } from "@/components/shell/loading";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  KIND_COLOR,
  LAYER_LABEL,
  MAP_LAYERS,
  NE_BOUNDS,
  sortByDistance,
  type MapLayer,
  type MapSignal,
} from "@/lib/map";
import { cn } from "@/lib/utils";
import { ExploreMapLazy, type ExploreMapHandle, type MapView } from "./explore-map-lazy";

const LIST_LIMIT = 20;

type State = "AS" | "ML";

function Chip({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: React.ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap shadow-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted",
      )}
    >
      {dot ? <span aria-hidden className="size-2 rounded-full" style={{ background: dot }} /> : null}
      {children}
    </button>
  );
}

const LAYER_DOT: Record<MapLayer, string> = {
  reports: KIND_COLOR.scam,
  properties: KIND_COLOR.verified,
  tariffs: KIND_COLOR.board,
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Explore screen: the map on the left, filters and a "Nearby signals" list on the right
 * (a bottom sheet on phones). Panning or filtering reloads the pins and the list together.
 */
export function MapExplorer() {
  const mapRef = useRef<ExploreMapHandle>(null);
  const [layers, setLayers] = useState<MapLayer[]>([...MAP_LAYERS]);
  const [state, setState] = useState<State | null>(null);
  const [recent, setRecent] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 350);

  const [view, setView] = useState<MapView | null>(null);
  const [signals, setSignals] = useState<MapSignal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const fitAfterLoad = useRef(false);

  // A search looks across the whole region and then moves the map to the matches;
  // otherwise the list follows what is on screen.
  const bboxParam = q ? undefined : view?.bbox.map((n) => n.toFixed(4)).join(",");
  const ready = q ? true : !!view;

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ layers: layers.join(",") });
    if (bboxParam) params.set("bbox", bboxParam);
    if (state) params.set("state", state);
    if (recent) params.set("days", "30");
    if (q) params.set("q", q);

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/map?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(res.status === 429 ? "Too many requests. Wait a moment." : "Could not load the map data.");
        const data = (await res.json()) as { signals: MapSignal[]; total: number };
        setSignals(data.signals);
        setTotal(data.total);
        setError(null);
        if (fitAfterLoad.current) {
          fitAfterLoad.current = false;
          mapRef.current?.fitTo(data.signals);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [ready, bboxParam, layers, state, recent, q]);

  // When the search text changes, move the map to the new matches once they arrive.
  useEffect(() => {
    fitAfterLoad.current = q.length > 0;
  }, [q]);

  const listed = useMemo(() => {
    const center = view?.center ?? { lat: (NE_BOUNDS[1] + NE_BOUNDS[3]) / 2, lng: (NE_BOUNDS[0] + NE_BOUNDS[2]) / 2 };
    return sortByDistance(signals, center).slice(0, LIST_LIMIT);
  }, [signals, view]);

  const toggleLayer = (layer: MapLayer) =>
    setLayers((cur) => (cur.includes(layer) ? (cur.length > 1 ? cur.filter((l) => l !== layer) : cur) : [...cur, layer]));

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) document.getElementById(`signal-${id}`)?.scrollIntoView({ block: "nearest" });
  }, []);

  const list = (
    <>
      <div className="flex items-center justify-between px-5 py-3">
        <h2 className="text-[15px] font-semibold">Nearby signals</h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {loading && signals.length === 0 ? "Loading…" : `${listed.length} of ${total}`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t">
        {error ? (
          <p role="alert" className="px-5 py-4 text-sm text-danger">
            {error}
          </p>
        ) : loading && signals.length === 0 ? (
          <div className="flex flex-col" aria-busy="true">
            <LoadingState text="Loading nearby signals…" className="px-5 py-3" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b px-5 py-3.5">
                <Skeleton className="size-3 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        ) : listed.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
            <p className="text-sm font-medium">Nothing here</p>
            <p className="text-sm text-muted-foreground">No reports, properties or tariff boards match. Zoom out or change the filters.</p>
          </div>
        ) : (
          <ul className={cn("flex flex-col", loading && "opacity-60 transition-opacity")}>
            {listed.map((s) => (
              <li key={s.id} id={`signal-${s.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    select(s.id);
                    mapRef.current?.focus(s);
                    setSheetOpen(false);
                  }}
                  aria-current={selectedId === s.id || undefined}
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-5 py-3.5 text-left outline-none hover:bg-soft focus-visible:bg-soft",
                    selectedId === s.id && "bg-soft",
                  )}
                >
                  <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: KIND_COLOR[s.kind] }} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">{s.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{s.subtitle}</span>
                  </span>
                  <Badge variant="outline">{s.badge}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return (
    // The grid needs an explicit row: with an auto row it grows with the long list, which left
    // the map frame without a definite height (the canvas fell back to a 300px strip).
    <div className="relative flex size-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)]">
      {/* Map */}
      <div className="relative min-h-0 flex-1 p-0 lg:p-6">
        <div className="relative size-full overflow-hidden bg-[#eef1ee] lg:rounded-2xl lg:border">
          <ExploreMapLazy ref={mapRef} signals={signals} selectedId={selectedId} onSelect={select} onViewChange={setView} />
          <div className="pointer-events-none absolute top-4 left-4 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-2">
            <span className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-[13px] font-medium shadow-xs">
              <FilterIcon className="size-3.5" />
              Layers
            </span>
            {MAP_LAYERS.map((layer) => (
              <span key={layer} className="pointer-events-auto">
                <Chip active={layers.includes(layer)} onClick={() => toggleLayer(layer)} dot={layers.includes(layer) ? undefined : LAYER_DOT[layer]}>
                  {LAYER_LABEL[layer]}
                </Chip>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Panel: right column on desktop, bottom sheet on phones */}
      <aside
        aria-label="Search and nearby signals"
        className={cn(
          "z-10 flex flex-col border-t bg-background shadow-[0_-8px_24px_rgb(0_0_0/0.08)] transition-[height] duration-200",
          "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(3.75rem+env(safe-area-inset-bottom))] max-lg:rounded-t-2xl",
          sheetOpen ? "max-lg:h-[62svh]" : "max-lg:h-[4.25rem]",
          "lg:h-full lg:border-t-0 lg:border-l lg:shadow-none",
        )}
      >
        <button
          type="button"
          aria-expanded={sheetOpen}
          aria-label={sheetOpen ? "Collapse the list" : "Expand the list"}
          onClick={() => setSheetOpen((o) => !o)}
          className="flex shrink-0 flex-col items-center gap-1 pt-2 pb-1 lg:hidden"
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-border" />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ChevronUpIcon className={cn("size-3.5 transition-transform", sheetOpen && "rotate-180")} />
            {loading && signals.length === 0 ? "Loading signals…" : `${total} signal${total === 1 ? "" : "s"} in view`}
          </span>
        </button>

        <div className={cn("flex min-h-0 flex-1 flex-col", !sheetOpen && "max-lg:hidden")}>
          <div className="flex flex-col gap-3 p-4 lg:p-5">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a place or district"
                aria-label="Search a place or district"
                className="h-10 pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip active={state === "AS"} onClick={() => setState((s) => (s === "AS" ? null : "AS"))}>
                Assam
              </Chip>
              <Chip active={state === "ML"} onClick={() => setState((s) => (s === "ML" ? null : "ML"))}>
                Meghalaya
              </Chip>
              <Chip active={recent} onClick={() => setRecent((r) => !r)}>
                Last 30 days
              </Chip>
            </div>
          </div>
          {list}
        </div>
      </aside>
    </div>
  );
}
