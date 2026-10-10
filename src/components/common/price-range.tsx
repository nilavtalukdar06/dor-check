import { cn } from "@/lib/utils";

const money = (n: number) => `Rs ${n.toLocaleString("en-IN")}`;

/** Track with the usual range highlighted and a marker for the quote. */
export function PriceRange({
  low,
  high,
  quote,
  className,
}: {
  low: number;
  high: number;
  quote: number;
  className?: string;
}) {
  const max = Math.max(quote, high) * 1.05;
  const pct = (n: number) => `${(n / max) * 100}%`;
  const share = (n: number) => (n / max) * 100;
  // The right-aligned "quoted" label only works when the quote is the far-right marker.
  const crowded = share(quote) < 80 || [low, high].some((n) => Math.abs(share(quote) - share(n)) < 14);
  const out = quote < low ? "below" : quote > high ? "above" : "within";
  const tone = out === "within" ? "bg-ok" : out === "below" ? "bg-info" : "bg-danger";
  const toneText =
    out === "within" ? "text-ok" : out === "below" ? "text-info" : "text-danger";

  return (
    <div data-slot="price-range" className={cn("flex flex-col gap-2", className)}>
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 bg-ok/25"
          style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
        />
        {[low, high].map((n) => (
          <span
            key={n}
            className="absolute top-0 h-3 w-0.5 bg-ok"
            style={{ left: pct(n) }}
          />
        ))}
        <span
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
            tone,
          )}
          style={{ left: pct(quote) }}
        />
      </div>
      <div className="relative h-4 text-xs text-muted-foreground">
        <span className="absolute left-0">Rs 0</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(low) }}>
          {money(low)}
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(high) }}>
          {money(high)}
        </span>
        {!crowded ? (
          <span className={cn("absolute right-0 font-medium", toneText)}>{money(quote)} quoted</span>
        ) : null}
      </div>
      {crowded ? (
        // The quote sits near another label: give it its own row, centred under the marker.
        <div className="relative h-4 text-xs">
          <span
            className={cn("absolute font-medium whitespace-nowrap", toneText)}
            style={{ left: `clamp(48px, ${pct(quote)}, calc(100% - 48px))`, transform: "translateX(-50%)" }}
          >
            {money(quote)} quoted
          </span>
        </div>
      ) : null}
    </div>
  );
}
