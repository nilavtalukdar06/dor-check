"use client";

import { AudioLinesIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { textLanguage, VOICE_LANGUAGES, type VoiceLanguage } from "@/lib/voice";
import { cn } from "@/lib/utils";

type State = "idle" | "loading" | "playing";

/**
 * "Read aloud" for a piece of text on any page: choose a language and it is spoken (translated
 * first if needed). The audio is saved to the person's history on the Read aloud screen.
 */
export function ListenButton({ text, title, source, label = "Read aloud", variant = "outline", className, autoPlay }: { text: string; title?: string; source?: { investigationId?: string; chatMessageId?: string }; label?: string; variant?: "outline" | "ghost"; className?: string; /** Speak it once when the page opens (the person turned on Auto read verdicts). Browsers may refuse until the page is tapped; then the button is there. */ autoPlay?: { language: VoiceLanguage; key: string } })  {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const own = textLanguage(text);

  useEffect(() => () => audio.current?.pause(), []);

  const stop = () => {
    audio.current?.pause();
    setState("idle");
  };

  const play = async (language: VoiceLanguage) => {
    setError(null);
    setState("loading");
    try {
      const res = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 5000), language, title, source }) });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "That didn't work.");
        return setState("idle");
      }
      audio.current?.pause();
      const el = new Audio(`/api/voice/${data.id}/audio`);
      audio.current = el;
      el.onended = () => setState("idle");
      el.onerror = () => {
        setError("The audio couldn't be played.");
        setState("idle");
      };
      await el.play();
      setState("playing");
    } catch {
      setError("We couldn't reach the server.");
      setState("idle");
    }
  };

  const autoKey = autoPlay?.key;
  const autoLanguage = autoPlay?.language;
  useEffect(() => {
    if (!autoKey || !autoLanguage) return;
    // Once per result and browser tab, so reloading does not speak it again.
    try {
      if (sessionStorage.getItem(autoKey)) return;
      sessionStorage.setItem(autoKey, "1");
    } catch {
      // storage blocked: speak anyway, once per page load
    }
    const timer = setTimeout(() => void play(autoLanguage), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, autoLanguage]);

  if (state === "playing") {
    return (
      <Button variant={variant} size="sm" className={cn("h-8 gap-2 shadow-xs", className)} onClick={stop} data-testid="listen-stop">
        <SquareIcon className="size-3 fill-current" aria-hidden />Stop
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger disabled={state === "loading"} className={cn("inline-flex h-8 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium shadow-xs outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60", variant === "ghost" && "border-transparent bg-transparent shadow-none", className)} data-testid="listen">
          {state === "loading" ? <Spinner /> : <AudioLinesIcon className="size-4" aria-hidden />}
          {state === "loading" ? "Preparing audio…" : label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          {VOICE_LANGUAGES.map((l) => (
            <DropdownMenuItem key={l.value} onClick={() => void play(l.value)} data-listen-language={l.value}>
              {l.select}
              {l.value === own ? <span className="ml-auto text-xs text-muted-foreground">as written</span> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <span role="alert" className="max-w-64 text-xs text-destructive" data-testid="listen-error">{error}</span> : null}
    </span>
  );
}
