import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { env } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import { codeFromIso, defaultVoice, FALLBACK_VOICE, modelTakesLanguage, modelTakesSpeed, TTS_MODELS, voiceBelongsTo, type VoiceLanguage } from "@/lib/voice";
import { encodeWav } from "@/lib/wav";

// ElevenLabs: text to speech (eleven_v3) and speech to text (Scribe v2). Failures are thrown as
// SpeechError with a message that is safe to show.

export const elevenlabsConfigured = () => Boolean(env.ELEVENLABS_API_KEY);
/** The model for a language: the override if one is set, otherwise the one that suits that language. */
export const ttsModel = (language: VoiceLanguage) => env.ELEVENLABS_TTS_MODEL || TTS_MODELS[language];

export class SpeechError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly retryable = false) {
    super(message);
    this.name = "SpeechError";
  }
}

let client: ElevenLabsClient | null = null;
const api = () => {
  if (!env.ELEVENLABS_API_KEY) throw new SpeechError("Speech is not configured.");
  return (client ??= new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY, timeoutInSeconds: 60 }));
};

type Failure = { statusCode?: number; body?: { detail?: { status?: string; message?: string } | string }; message?: string };

/** What ElevenLabs said went wrong, as a status and a plain message. */
function failure(e: unknown): { status: number | null; code: string; message: string } {
  const f = e as Failure;
  const detail = typeof f.body?.detail === "object" ? f.body.detail : undefined;
  return { status: f.statusCode ?? null, code: detail?.status ?? "", message: detail?.message ?? (typeof f.body?.detail === "string" ? f.body.detail : f.message ?? "failed") };
}
const shouldRetry = (e: unknown) => {
  const s = failure(e).status;
  return s === 429 || (s !== null && s >= 500) || s === null;
};
/** The account cannot use this voice (a library voice on a free plan). */
const voiceBlocked = (e: unknown) => {
  const f = failure(e);
  return f.status === 402 || f.code === "paid_plan_required" || /library voice/i.test(f.message);
};

const LANG_PARAM: Record<VoiceLanguage, string> = { en: "en", hi: "hi", as: "as" };

export type TtsOptions = { language: VoiceLanguage; speaker: string; pace: number; stability: number; similarity: number };

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** 16-bit little-endian PCM bytes to samples. */
const pcmToSamples = (bytes: Uint8Array) => new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length - (bytes.length % 2)));

/**
 * One piece of text to one WAV file. If ElevenLabs will not let this account use the chosen voice
 * (library voices need a paid plan) the language's premade fallback voice speaks instead, and the
 * voice actually used is returned so history shows what was heard.
 */
export async function ttsPiece(text: string, o: TtsOptions): Promise<{ wav: Uint8Array; speaker: string }> {
  const model = ttsModel(o.language);
  const request = async (voiceId: string, withLanguage: boolean) => {
    const stream = await api().textToSpeech.convert(voiceId, {
      text,
      modelId: model,
      ...(withLanguage && modelTakesLanguage(model) ? { languageCode: LANG_PARAM[o.language] } : {}),
      outputFormat: "pcm_24000",
      voiceSettings: { stability: o.stability, similarityBoost: o.similarity, ...(modelTakesSpeed(model) ? { speed: o.pace } : {}) },
    });
    return pcmToSamples(await readAll(stream as unknown as ReadableStream<Uint8Array>));
  };
  const attempt = async (voiceId: string) => {
    try {
      return await withRetry(() => request(voiceId, true), { retries: 2, timeoutMs: 60_000, shouldRetry });
    } catch (e) {
      // A model that does not accept the language hint still reads the text.
      if (failure(e).status === 400 && /language_code/i.test(failure(e).message)) return withRetry(() => request(voiceId, false), { retries: 1, timeoutMs: 60_000, shouldRetry });
      throw e;
    }
  };

  let speaker = voiceBelongsTo(o.speaker, o.language) ? o.speaker : defaultVoice(o.language);
  let samples: Int16Array;
  try {
    samples = await attempt(speaker);
  } catch (e) {
    if (voiceBlocked(e) && speaker !== FALLBACK_VOICE.id) {
      speaker = FALLBACK_VOICE.id;
      samples = await attempt(speaker).catch((e2) => {
        throw toSpeechError(e2);
      });
    } else throw toSpeechError(e);
  }
  if (!samples.length) throw new SpeechError("ElevenLabs returned no audio.");
  return { wav: encodeWav(samples, 24000), speaker };
}

function toSpeechError(e: unknown): SpeechError {
  if (e instanceof SpeechError) return e;
  const f = failure(e);
  console.error("elevenlabs: failed", f.status, f.code, f.message.slice(0, 200));
  if (f.status === 401 || f.status === 403) return new SpeechError("Speech isn't available right now.", f.status);
  if (f.status === 402 || f.code === "quota_exceeded") return new SpeechError("The speech quota has been used up for now.", f.status ?? 402);
  if (f.status === 429) return new SpeechError("The speech service is busy. Try again in a moment.", 429, true);
  return new SpeechError("The speech service failed.", f.status, shouldRetry(e));
}

export type SttResult = { transcript: string; language: string | null };

/** A recording (WAV) to text. The language is detected; it comes back as one of our codes (as-IN, hi-IN ...). */
export async function sttClip(wav: Uint8Array): Promise<SttResult> {
  try {
    const res = await withRetry(
      () => api().speechToText.convert({ file: new File([wav as BlobPart], "report.wav", { type: "audio/wav" }), modelId: "scribe_v2", tagAudioEvents: false, timestampsGranularity: "none" }),
      { retries: 2, timeoutMs: 90_000, shouldRetry },
    );
    const r = res as unknown as { text?: string; languageCode?: string; language_code?: string };
    return { transcript: (r.text ?? "").trim(), language: codeFromIso(r.languageCode ?? r.language_code) };
  } catch (e) {
    throw toSpeechError(e);
  }
}
