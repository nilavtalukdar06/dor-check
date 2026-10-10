"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { VoiceLanguage } from "@/lib/voice";

type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };
const ctor = () => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const LANG = { en: "en-IN", hi: "hi-IN", as: "as-IN" } as const;

/** Dictation with the browser's own speech recognition, where it exists. Recorded speech (voice reporting) goes through ElevenLabs Scribe instead. */
export function useSpeechInput(language: VoiceLanguage, onText: (text: string) => void) {
  const supported = useSyncExternalStore(() => () => undefined, () => ctor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const toggle = () => {
    if (listening) return rec.current?.stop();
    const Ctor = ctor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = LANG[language];
    r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
      if (said) onText(said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };
  return { supported, listening, toggle };
}
