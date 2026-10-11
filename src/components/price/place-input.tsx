"use client";

import { LoaderCircleIcon, MapPinIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { PickedGeoInput } from "@/lib/price-schema";
import { cn } from "@/lib/utils";
import type { PlaceSuggestion } from "@/server/geocoding";

/** What was picked. `at` is the point on the map, for forms that set a pin. */
export type PlacePick = { placeId?: string; geo?: PickedGeoInput; at?: { lat: number; lng: number } };

/**
 * Place box with live suggestions: curated places first, then Mapbox (towns, localities,
 * airports, sights). Free text is fine too; the server geocodes it.
 */
export function PlaceInput({
  value,
  onChange,
  popular,
  placeholder,
  invalid,
  id,
}: {
  value: string;
  onChange: (text: string, pick?: PlacePick) => void;
  popular: PlaceSuggestion[];
  placeholder?: string;
  invalid?: boolean;
  id?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
  }, []);

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    if (q.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = (await res.json()) as { results?: PlaceSuggestion[] };
        setResults(json.results ?? []);
      } catch {
        // aborted or offline: keep the free text
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
  };

  const items = (results ?? popular).slice(0, 8);

  const pick = (s: PlaceSuggestion) => {
    onChange(
      s.name,
      s.source === "seed"
        ? { placeId: s.placeId, at: { lat: s.lat, lng: s.lng } }
        : { geo: { mapboxId: s.mapboxId!, name: s.name, detail: s.detail, lat: s.lat, lng: s.lng, kind: s.kind }, at: { lat: s.lat, lng: s.lng } },
    );
    setOpen(false);
  };

  return (
    <div className="relative">
      <MapPinIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/70" />
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        className="h-10 pr-9 pl-9"
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
          search(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + items.length) % items.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(items[active] ?? items[0]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading ? (
        <LoaderCircleIcon aria-label="Searching places" className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}
      {open && items.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
          {items.map((s, i) => (
            <li
              key={s.key}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input would lose focus and close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2", i === active && "bg-muted")}
            >
              <span className="flex items-center justify-between gap-3">
                <span>{s.name}</span>
                {s.source === "seed" ? <span className="text-[11px] text-ok">Known tariffs</span> : null}
              </span>
              {s.detail ? <span className="truncate text-xs text-muted-foreground">{s.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
