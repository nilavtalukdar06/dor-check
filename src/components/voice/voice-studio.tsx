"use client";

import { CheckIcon, DownloadIcon, FileTextIcon, MicIcon, PauseIcon, PlayIcon, Trash2Icon, AudioLinesIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteVoiceJobAction } from "@/app/(app)/voice/actions";
import { useSpeechInput } from "@/components/voice/use-speech-input";
import { Waveform } from "@/components/voice/waveform";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clock, defaultVoice, PACE, paceSupported, SIMILARITY, STABILITY, TTS_MAX_CHARS, VOICE_LANGUAGES, VOICES, voiceName, type VoiceLanguage } from "@/lib/voice";
import { cn } from "@/lib/utils";
import type { VoiceJobView } from "@/server/voice";

export type VerdictOption = { id: string; title: string; text: string };

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** The Read aloud screen: text in, speech out, with the player, settings and history. */
export function VoiceStudio({ initialText, initialLanguage, initialSpeaker, initialSettings, history: initialHistory, verdicts }: { initialText: string; initialLanguage: VoiceLanguage; initialSpeaker: string; initialSettings: { pace: number; stability: number; similarity: number }; history: VoiceJobView[]; verdicts: VerdictOption[] }) {
  const [text, setText] = useState(initialText);
  const [language, setLanguage] = useState<VoiceLanguage>(initialLanguage);
  const [speaker, setSpeaker] = useState(initialSpeaker);
  const [pace, setPace] = useState(initialSettings.pace);
  const [stability, setStability] = useState(initialSettings.stability);
  const [similarity, setSimilarity] = useState(initialSettings.similarity);
  const [history, setHistory] = useState(initialHistory);
  const [job, setJob] = useState<VoiceJobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ now: 0, total: 0 });
  const [showSpoken, setShowSpoken] = useState(false);
  const [pickVerdict, setPickVerdict] = useState(false);
  const [tab, setTab] = useState<"settings" | "history">("settings");
  const [pending, start] = useTransition();
  const audio = useRef<HTMLAudioElement>(null);

  const dictation = useSpeechInput(language, (said) => setText((cur) => `${cur}${cur && !cur.endsWith(" ") ? " " : ""}${said}`.slice(0, TTS_MAX_CHARS)));

  const chooseLanguage = (l: VoiceLanguage) => {
    setLanguage(l);
    if (!VOICES[l].some((v) => v.id === speaker)) setSpeaker(defaultVoice(l));
  };

  const generate = async () => {
    const lang = language;
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setReady(false);
    try {
      const res = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, language: lang, speaker: VOICES[lang].some((v) => v.id === speaker) ? speaker : defaultVoice(lang), pace, stability, similarity }) });
      const data = (await res.json()) as VoiceJobView & { error?: string };
      if (!res.ok) return setError(data.error ?? "That didn't work.");
      setJob(data);
      setShowSpoken(false);
      setHistory((h) => [data, ...h.filter((x) => x.id !== data.id)]);
      setReady(true);
      setTimeout(() => setReady(false), 5000);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // A new clip starts playing as soon as it is made.
  useEffect(() => {
    const el = audio.current;
    if (!el || !job) return;
    el.load();
    void el.play().catch(() => undefined);
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const src = job ? `/api/voice/${job.id}/audio` : null;
  const progress = time.total ? Math.min(1, time.now / time.total) : 0;
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="voice-studio">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[28px] leading-9 font-semibold tracking-tight">Read aloud</h1>
            <p className="text-[15px] text-muted-foreground">Turn any verdict or advisory into speech in Assamese, Hindi or English.</p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs">ElevenLabs</span>
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
          <label htmlFor="voice-text" className="sr-only">Text to read aloud</label>
          <textarea id="voice-text" value={text} onChange={(e) => setText(e.target.value.slice(0, TTS_MAX_CHARS))} placeholder="Paste or type what you want to hear. Text in another language is translated first." className="min-h-56 w-full resize-y bg-transparent p-5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground" />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
            <span className="text-xs text-muted-foreground" data-testid="char-count">{text.length.toLocaleString("en-IN")} / {TTS_MAX_CHARS.toLocaleString("en-IN")} characters</span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPickVerdict((o) => !o)} aria-expanded={pickVerdict} disabled={verdicts.length === 0}>
                  <FileTextIcon className="size-3.5" aria-hidden />From a verdict
                </Button>
                {pickVerdict ? (
                  <ul className="absolute right-0 bottom-full z-10 mb-2 max-h-64 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md" role="listbox" aria-label="Your recent verdicts">
                    {verdicts.map((v) => (
                      <li key={v.id}>
                        <button type="button" role="option" aria-selected={false} className="w-full truncate rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-soft focus-visible:bg-soft" onClick={() => { setText(v.text.slice(0, TTS_MAX_CHARS)); setPickVerdict(false); }}>{v.title}</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {dictation.supported ? (
                <Button variant="outline" size="sm" className={cn("gap-1.5", dictation.listening && "border-destructive text-destructive")} onClick={dictation.toggle} aria-pressed={dictation.listening}>
                  <MicIcon className="size-3.5" aria-hidden />{dictation.listening ? "Listening…" : "Dictate"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {job && src ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs" data-testid="player" data-job={job.id}>
            <div className="flex items-center gap-4">
              <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                {playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="size-4 fill-current" />}
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold" data-testid="player-title">{job.title}</span>
                <span className="text-xs text-muted-foreground" data-testid="player-time">Voice: {voiceName(job.speaker)} · {clock(time.now)} / {clock(time.total || job.durationSec)}</span>
              </div>
              <Button variant="outline" size="icon" render={<a href={`${src}?download=1`} download />} nativeButton={false} aria-label="Download audio"><DownloadIcon /></Button>
            </div>
            <Waveform src={src} progress={progress} onSeek={(f) => { const el = audio.current; if (el && time.total) el.currentTime = f * time.total; }} />
            <audio ref={audio} src={src} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={(e) => setTime({ now: e.currentTarget.currentTime, total: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : job.durationSec })} onLoadedMetadata={(e) => setTime({ now: 0, total: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : job.durationSec })} data-testid="audio" />
            {job.translated ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setShowSpoken((s) => !s)} aria-expanded={showSpoken} className="w-fit text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:underline">{showSpoken ? "Hide" : "Show"} what was spoken (translated)</button>
                {showSpoken ? <p className="rounded-lg border bg-soft p-3 text-sm leading-relaxed" lang={job.language === "hi" ? "hi" : job.language === "as" ? "as" : "en"} data-testid="spoken-text">{job.spokenText}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" data-testid="voice-error">{error}</div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect aria-label="Language" value={language} onChange={(e) => chooseLanguage(e.target.value as VoiceLanguage)} className="w-auto min-w-44">
            {VOICE_LANGUAGES.map((l) => <NativeSelectOption key={l.value} value={l.value}>{l.select}</NativeSelectOption>)}
          </NativeSelect>
          <NativeSelect aria-label="Voice" value={speaker} onChange={(e) => setSpeaker(e.target.value)} className="w-auto min-w-40">
            {VOICES[language].map((v) => <NativeSelectOption key={v.id} value={v.id}>{v.name} · {v.note}</NativeSelectOption>)}
          </NativeSelect>
          <Button className="ml-auto h-10 gap-2 px-5" onClick={() => void generate()} disabled={busy || !text.trim()} data-testid="generate">
            {busy ? <Spinner /> : <AudioLinesIcon className="size-4" aria-hidden />}
            {busy ? "Generating…" : "Generate speech"}
          </Button>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs lg:sticky lg:top-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "settings" | "history")}>
          <TabsList className="w-full">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="history" data-testid="history-tab">History</TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="flex flex-col gap-6 pt-4">
            <SliderRow label="Pace" value={pace} display={paceSupported(language) ? `${pace.toFixed(2)}x` : "Not available"} {...PACE} low="Slower" high="Faster" onChange={setPace} disabled={!paceSupported(language)} hint={paceSupported(language) ? undefined : "The Assamese voice sets its own pace."} />
            <SliderRow label="Stability" value={stability} display={stability.toFixed(2)} {...STABILITY} low="More expressive" high="More even" onChange={setStability} />
            <SliderRow label="Similarity" value={similarity} display={similarity.toFixed(2)} {...SIMILARITY} low="Looser" high="Closer to the voice" onChange={setSimilarity} />
            <div className="flex flex-col gap-2 border-t pt-4">
              <h2 className="text-[15px] font-semibold">Languages</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Language">
                {VOICE_LANGUAGES.map((l) => (
                  <button key={l.value} type="button" aria-pressed={language === l.value} onClick={() => chooseLanguage(l.value)} className={cn("h-8 rounded-full border px-3.5 text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50", language === l.value ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-soft")}>{l.label}</button>
                ))}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground" data-testid="history-empty">Audio you generate appears here.</p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="history-list">
                {history.map((h) => (
                  <li key={h.id} className="group/h flex items-center gap-1" data-history={h.id}>
                    <button type="button" onClick={() => { setJob(h); setShowSpoken(false); }} className={cn("flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50", job?.id === h.id && "bg-soft")}>
                      <span className="truncate text-sm font-medium">{h.title}</span>
                      <span className="text-xs text-muted-foreground">{voiceName(h.speaker)} · {clock(h.durationSec)} · {when(h.createdAt)}</span>
                    </button>
                    <button type="button" aria-label={`Delete ${h.title}`} disabled={pending} onClick={() => start(async () => { const r = await deleteVoiceJobAction(h.id); if (r.ok) { setHistory((x) => x.filter((y) => y.id !== h.id)); if (job?.id === h.id) setJob(null); } })} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none group-hover/h:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50">
                      <Trash2Icon className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </aside>

      {ready ? (
        <div role="status" className="fixed right-4 bottom-4 z-50 flex w-72 items-center gap-3 rounded-xl border bg-card p-4 shadow-lg" data-testid="audio-ready">
          <CheckIcon className="size-4 text-ok" aria-hidden />
          <div className="flex flex-col"><span className="text-sm font-semibold">Audio ready</span><span className="text-xs text-muted-foreground">Saved to history</span></div>
        </div>
      ) : null}
    </div>
  );
}

function SliderRow({ label, value, display, min, max, step, low, high, onChange, disabled, hint }: { label: string; value: number; display: string; min: number; max: number; step: number; low: string; high: string; onChange: (v: number) => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm"><span className="font-semibold">{label}</span><span className="text-xs text-muted-foreground" data-testid={`${label.toLowerCase()}-value`}>{display}</span></div>
      <Slider aria-label={label} disabled={disabled} value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
      <div className="flex justify-between text-xs text-muted-foreground"><span>{low}</span><span>{high}</span></div>
      {hint ? <p className="text-xs text-muted-foreground" data-testid={`${label.toLowerCase()}-hint`}>{hint}</p> : null}
    </div>
  );
}
