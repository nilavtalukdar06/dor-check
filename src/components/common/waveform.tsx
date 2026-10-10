import { cn } from "@/lib/utils";

function heights(count: number, seed: number) {
  let x = seed;
  return Array.from({ length: count }, () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return 0.15 + (x / 2 ** 32) * 0.85;
  });
}

/** Static bar waveform; `progress` (0-1) darkens the played part. */
export function Waveform({
  progress = 0,
  bars = 96,
  seed = 7,
  className,
}: {
  progress?: number;
  bars?: number;
  seed?: number;
  className?: string;
}) {
  const hs = heights(bars, seed);
  return (
    <div
      role="img"
      aria-label="Audio waveform"
      className={cn("flex h-12 w-full items-center gap-[3px]", className)}
    >
      {hs.map((h, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] shrink-0 grow rounded-full",
            i / bars < progress ? "bg-foreground" : "bg-border",
          )}
          style={{ height: `${Math.round(h * 100)}%` }}
        />
      ))}
    </div>
  );
}
