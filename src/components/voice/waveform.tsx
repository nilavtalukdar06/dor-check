"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const BARS = 96;

/** The loudness of each slice of an audio file, 0 to 1. Decoded in the browser with Web Audio. */
async function peaks(src: string, bars: number): Promise<number[]> {
  const res = await fetch(src);
  if (!res.ok) throw new Error("audio");
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    const data = buf.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / bars));
    const out: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j += 8) max = Math.max(max, Math.abs(data[j]));
      out.push(max);
    }
    const top = Math.max(...out, 0.001);
    return out.map((p) => Math.max(0.06, p / top));
  } finally {
    void ctx.close();
  }
}

/** Bars drawn from the audio itself. The played part is dark; click or use the arrow keys to seek. */
export function Waveform({ src, progress, onSeek, className }: { src: string; progress: number; onSeek: (fraction: number) => void; className?: string }) {
  const [state, setState] = useState<{ src: string; bars: number[] | null; failed: boolean }>({ src: "", bars: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    peaks(src, BARS)
      .then((bars) => !cancelled && setState({ src, bars, failed: false }))
      .catch(() => !cancelled && setState({ src, bars: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [src]);

  const bars = state.src === src ? state.bars : null;
  const shown = bars ?? Array.from({ length: BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i / 3)));
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      data-testid="waveform"
      data-ready={bars ? "true" : "false"}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 0.05));
        if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
      }}
      className={cn("flex h-14 w-full cursor-pointer items-center gap-[2px] rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50", !bars && !state.failed && "animate-pulse", className)}
    >
      {shown.map((p, i) => (
        <span key={i} aria-hidden className={cn("min-w-px flex-1 rounded-full", i / BARS < progress ? "bg-foreground" : "bg-foreground/20")} style={{ height: `${Math.round(p * 100)}%` }} />
      ))}
    </div>
  );
}
