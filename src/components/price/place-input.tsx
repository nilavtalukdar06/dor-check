"use client";

import { MapPinIcon } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PlaceOption = { id: string; name: string; kind: string; district: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Text box with suggestions from the directory's places. Typing anything else is fine:
 * the engine falls back to matching the words you typed.
 */
export function PlaceInput({
  value,
  onChange,
  places,
  placeholder,
  invalid,
  id,
}: {
  value: string;
  onChange: (text: string, placeId?: string) => void;
  places: PlaceOption[];
  placeholder?: string;
  invalid?: boolean;
  id?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const q = norm(value);
  const matches = (q ? places.filter((p) => norm(`${p.name} ${p.district}`).includes(q)) : places).slice(0, 7);

  const pick = (p: PlaceOption) => {
    onChange(p.name, p.id);
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
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        className="h-10 pl-9"
        onChange={(e) => {
          onChange(e.target.value, undefined);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active] ?? matches[0]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input would lose focus and close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2",
                i === active && "bg-muted",
              )}
            >
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.district}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
