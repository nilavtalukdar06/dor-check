import { cn } from "@/lib/utils";

const ORBS = [
  ["#c7d2fe", "#6366f1"], // indigo
  ["#fef9c3", "#facc15"], // yellow
  ["#bbf7d0", "#34d399"], // green
  ["#fecaca", "#f87171"], // red
  ["#cffafe", "#22d3ee"], // cyan
  ["#e9d5ff", "#a855f7"], // purple
] as const;

export type OrbTone = 0 | 1 | 2 | 3 | 4 | 5;

/** Stable orb colour from any id string. */
export function orbToneFromId(id: string): OrbTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % ORBS.length) as OrbTone;
}

export function Orb({
  tone = 0,
  className,
}: {
  tone?: OrbTone;
  className?: string;
}) {
  const [light, base] = ORBS[tone];
  return (
    <span
      aria-hidden
      className={cn("inline-block size-10 shrink-0 rounded-full", className)}
      style={{
        background: `radial-gradient(circle at 32% 28%, ${light}, ${base})`,
      }}
    />
  );
}
