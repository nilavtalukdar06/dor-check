"use client";

import { MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRecorder } from "@/components/voice/use-recorder";
import { clock, RECORD_MAX_SEC, RECORD_MIN_SEC } from "@/lib/voice";
import { cn } from "@/lib/utils";

export type VoiceReportResult = { id: string; transcript: string; translated: string | null; language: string | null; languageName: string; durationSec: number };

/**
 * Speak a report instead of typing it. The microphone is only asked for when the person taps the
 * mic. The recording is transcribed (Assamese, Hindi, English and more are detected) and, when it
 * is not English, translated, then handed to the form to edit.
 */
export function VoiceReport({ onResult, className }: { onResult: (r: VoiceReportResult) => void; className?: string }) {
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<VoiceReportResult | null>(null);

  // At the time limit the recording is sent as if the person had tapped stop.
  const finishRef = useRef<() => void>(() => undefined);
  const rec = useRecorder(RECORD_MAX_SEC, () => finishRef.current());

  const finish = async () => {
    const blob = await rec.stop();
    if (!blob) return setError("Nothing was recorded. Try again.");
    if (blob.size < 44 + RECORD_MIN_SEC * 32000) return setError("That was too short. Hold on a little longer and speak.");
    setPhase("working");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "report.wav");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
      const data = (await res.json()) as VoiceReportResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "We couldn't transcribe that. You can try again or type your report.");
        return setPhase("idle");
      }
      setDone(data);
      setPhase("done");
      onResult(data);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again, or type your report.");
      setPhase("idle");
    }
  };
  useEffect(() => {
    finishRef.current = () => void finish();
  });

  if (!rec.supported) return null;
  const recording = rec.state === "recording";

  return (
    <section aria-label="Speak your report" className={cn("flex flex-col items-center gap-3 rounded-xl border bg-soft px-4 py-6 text-center", className)} data-testid="voice-report" data-phase={recording ? "recording" : phase}>
      {phase === "working" ? (
        <div role="status" className="flex flex-col items-center gap-3 py-2" data-testid="voice-working">
          <Spinner />
          <p className="text-sm font-medium">Transcribing and translating…</p>
          <p className="text-xs text-muted-foreground">This takes a few seconds.</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => (recording ? void finish() : void rec.start())}
            disabled={rec.state === "starting"}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className={cn("flex size-16 items-center justify-center rounded-full text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50", recording ? "bg-red-600 hover:bg-red-700" : "bg-red-600/90 hover:bg-red-600")}
            data-testid="record-button"
          >
            {rec.state === "starting" ? <Spinner /> : recording ? <SquareIcon className="size-5 fill-current" /> : <MicIcon className="size-6" />}
          </button>

          {recording ? (
            <>
              <div className="flex h-10 items-center gap-[3px]" aria-hidden data-testid="live-waveform">
                {rec.levels.map((l, i) => <span key={i} className="w-[3px] rounded-full bg-red-600" style={{ height: `${Math.round(l * 100)}%` }} />)}
              </div>
              <p className="text-sm font-medium" role="timer" data-testid="record-timer">Recording · {clock(rec.seconds)}</p>
              <p className="text-xs text-muted-foreground">Tap the square when you are done. Up to {RECORD_MAX_SEC / 60} minutes.</p>
            </>
          ) : phase === "done" && done ? (
            <>
              <p className="text-sm font-medium" data-testid="voice-done">{done.languageName} detected · transcribed{done.translated ? " and translated" : ""}</p>
              <p className="text-xs text-muted-foreground">Check the text below and fix anything we misheard before you send.</p>
              <Button variant="outline" size="sm" onClick={() => { setPhase("idle"); setDone(null); }}>Record again</Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Speak your report</p>
              <p className="text-xs text-muted-foreground">Tap the mic and describe what happened in Assamese, Hindi or English.</p>
            </>
          )}
        </>
      )}
      {rec.state === "denied" ? <p role="alert" className="text-[13px] text-danger" data-testid="voice-denied">Microphone access was blocked. Allow it in your browser&apos;s site settings, or type your report below.</p> : null}
      {rec.state === "failed" ? <p role="alert" className="text-[13px] text-danger">We couldn&apos;t start the microphone. You can type your report below.</p> : null}
      {error ? <p role="alert" className="text-[13px] text-danger" data-testid="voice-error">{error}</p> : null}
    </section>
  );
}
