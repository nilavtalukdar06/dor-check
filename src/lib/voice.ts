import { createHash } from "node:crypto";
import { detectLanguage } from "@/lib/assistant";

export { concatWav, parseWav, wavSeconds, type WavInfo } from "@/lib/wav";

// Rules for text to speech: languages, voices, limits, how text is cut up and how audio is joined.
// Pure, so tests and the server share them. Speech is ElevenLabs: one chosen voice per language, plus
// a free premade voice the server falls back to while the plan cannot use library voices.

export const VOICE_LANGUAGES = [
  { value: "en", code: "en-IN", label: "English", select: "English (India)" },
  { value: "hi", code: "hi-IN", label: "हिन्दी", select: "Hindi" },
  { value: "as", code: "as-IN", label: "অসমীয়া", select: "Assamese" },
] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]["value"];
export const isVoiceLanguage = (v: unknown): v is VoiceLanguage => VOICE_LANGUAGES.some((l) => l.value === v);
export const codeOf = (l: VoiceLanguage) => VOICE_LANGUAGES.find((x) => x.value === l)!.code;
export const languageFromCode = (code: string | null | undefined): VoiceLanguage => (VOICE_LANGUAGES.find((l) => l.code === code)?.value ?? "en");

export const VOICES: Record<VoiceLanguage, { id: string; name: string; note: string }[]> = {
  en: [{ id: "ZbxPfVOKktgkLqi5LCBx", name: "Dhara", note: "Professional" }],
  hi: [{ id: "X1aCu8g69vgtNfFwu68G", name: "Neha", note: "Expressive" }],
  as: [{ id: "eBjbdlli9b8tJL1ng9Vx", name: "Priyanka", note: "Natural" }],
};
/** A premade voice every ElevenLabs account may use, for when the chosen voice is refused (library voices need a paid plan). */
export const FALLBACK_VOICE = { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", note: "Standard" };
export const defaultVoice = (l: VoiceLanguage) => VOICES[l][0].id;
export const voiceName = (id: string | null | undefined) => (id ? [...Object.values(VOICES).flat(), FALLBACK_VOICE].find((v) => v.id === id)?.name ?? "Voice" : "");
export const voiceBelongsTo = (id: string, l: VoiceLanguage) => VOICES[l].some((v) => v.id === id);

/**
 * Which ElevenLabs model speaks which language. eleven_v3 is the one that takes Assamese (it accepts the
 * "as" language hint) but ignores the speed setting; eleven_multilingual_v2 reads Hindi and English well
 * and does follow speed, so the Pace slider only works for those two.
 */
export const TTS_MODELS: Record<VoiceLanguage, string> = { en: "eleven_multilingual_v2", hi: "eleven_multilingual_v2", as: "eleven_v3" };
/** Only some models accept a language hint or a speed. */
export const modelTakesLanguage = (model: string) => model === "eleven_v3" || model === "eleven_v4" || model === "eleven_flash_v2_5";
export const modelTakesSpeed = (model: string) => model !== "eleven_v3" && model !== "eleven_v4";
export const paceSupported = (l: VoiceLanguage) => modelTakesSpeed(TTS_MODELS[l]);
/** What the person may paste. */
export const TTS_MAX_CHARS = 5000;
/** One ElevenLabs request takes up to 5,000 characters; stay under it so pasted text is at most two pieces. */
export const TTS_CHUNK = 3000;
/** Per person, per hour. */
export const TTS_RATE = { limit: 30, windowSeconds: 3600 } as const;

export const PACE = { min: 0.7, max: 1.2, step: 0.05, default: 1 } as const;
export const STABILITY = { min: 0, max: 1, step: 0.05, default: 0.5 } as const;
export const SIMILARITY = { min: 0, max: 1, step: 0.05, default: 0.75 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const clampSettings = (s: { pace?: number; stability?: number; similarity?: number }) => ({
  pace: round(clamp(s.pace ?? PACE.default, PACE.min, PACE.max)),
  stability: round(clamp(s.stability ?? STABILITY.default, STABILITY.min, STABILITY.max)),
  similarity: round(clamp(s.similarity ?? SIMILARITY.default, SIMILARITY.min, SIMILARITY.max)),
});

/** The language the text is written in, as one of ours. */
export const textLanguage = (text: string): VoiceLanguage => detectLanguage(text);

/** Same text, language, voice, model and settings: same audio, so it is only made once. */
export function ttsCacheKey(p: { text: string; language: VoiceLanguage; speaker: string; model: string; pace: number; stability: number; similarity: number }) {
  return createHash("sha256").update(JSON.stringify([p.text.trim(), p.language, p.speaker, p.model, p.pace, p.stability, p.similarity])).digest("hex");
}

/**
 * Cut text into pieces under `max` characters, at sentence ends where possible, so each can be
 * spoken in one request and the pieces joined. Never returns an empty piece.
 */
export function chunkText(text: string, max = TTS_CHUNK): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?।॥])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if (s.length > max) {
      push();
      // A very long sentence: cut at commas or spaces.
      let rest = s;
      while (rest.length > max) {
        const window = rest.slice(0, max);
        const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(" "));
        const at = cut > max * 0.4 ? cut + 1 : max;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      cur = rest;
      continue;
    }
    if (cur && cur.length + 1 + s.length > max) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return out;
}

/** "0:12" or "1:05". */
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** What is spoken for a finished check: the headline, what it means, then what to do. Plain sentences, no symbols. */
export function verdictSpeech(v: { title: string; concern: string; summary: string; guidance: string[] }) {
  const level = v.concern === "HIGH" ? "High concern." : v.concern === "MEDIUM" ? "Some concern." : "Low concern.";
  const steps = v.guidance.slice(0, 5).map((g, i) => `Step ${i + 1}. ${g.replace(/\s+/g, " ").trim()}`);
  return [`${v.title}. ${level}`, v.summary.trim(), steps.length ? "What to do now." : "", ...steps].filter(Boolean).join(" ");
}

/** The languages people may speak, by our code, with the names we show. */
export const SPOKEN_LANGUAGES: Record<string, string> = {
  "as-IN": "Assamese", "hi-IN": "Hindi", "en-IN": "English", "bn-IN": "Bengali", "ne-IN": "Nepali", "mni-IN": "Manipuri", "brx-IN": "Bodo",
  "ta-IN": "Tamil", "te-IN": "Telugu", "kn-IN": "Kannada", "ml-IN": "Malayalam", "mr-IN": "Marathi", "gu-IN": "Gujarati", "pa-IN": "Punjabi", "od-IN": "Odia", "ur-IN": "Urdu",
};
/** ElevenLabs reports ISO 639-3 codes (asm, hin, eng ...); ours look like as-IN. */
const ISO3: Record<string, string> = { asm: "as-IN", hin: "hi-IN", eng: "en-IN", ben: "bn-IN", nep: "ne-IN", mni: "mni-IN", brx: "brx-IN", tam: "ta-IN", tel: "te-IN", kan: "kn-IN", mal: "ml-IN", mar: "mr-IN", guj: "gu-IN", pan: "pa-IN", ori: "od-IN", urd: "ur-IN", as: "as-IN", hi: "hi-IN", en: "en-IN", bn: "bn-IN" };
export const codeFromIso = (iso: string | null | undefined): string | null => (iso ? ISO3[iso.toLowerCase()] ?? iso : null);
/**
 * Scribe often calls Assamese "Bengali": the two share a script. Assamese writes ৰ and ৱ where Bengali
 * uses র and a plain ব, so a text with either of those is Assamese.
 */
export const refineLanguage = (code: string | null, text: string): string | null => (code === "bn-IN" && /[\u09F0\u09F1]/.test(text) ? "as-IN" : code);
export const spokenLanguageName = (code: string | null | undefined) => (code ? SPOKEN_LANGUAGES[code] ?? code : "Unknown");

/** A voice report: up to two minutes, at least a second. Recorded as 16 kHz mono WAV. */
export const RECORD_MAX_SEC = 120;
export const RECORD_MIN_SEC = 1;
export const RECORD_RATE = 16000;
export const STT_RATE = { limit: 10, windowSeconds: 3600 } as const;
