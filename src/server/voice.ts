import prisma from "@/lib/prisma";
import {
  chunkText,
  clampSettings,
  FALLBACK_VOICE,
  codeOf,
  concatWav,
  defaultVoice,
  isVoiceLanguage,
  textLanguage,
  TTS_MAX_CHARS,
  TTS_RATE,
  ttsCacheKey,
  voiceBelongsTo,
  wavSeconds,
  type VoiceLanguage,
} from "@/lib/voice";
import { consumeRateLimit } from "@/server/rate-limit";
import { elevenlabsConfigured, SpeechError, ttsModel, ttsPiece, type TtsOptions } from "@/server/elevenlabs";
import { translateCodes, TranslateError, type TranslateFn } from "@/server/translate";
import { deleteObject, putObject, storageConfigured } from "@/server/storage";

export type SpeakRequest = {
  text: string;
  /** What to speak in. Text in another language is translated first. */
  language: VoiceLanguage;
  speaker?: string;
  pace?: number;
  stability?: number;
  similarity?: number;
  title?: string;
  /** What this audio is about, so history can link back. */
  source?: { investigationId?: string; reportId?: string; advisoryId?: string; chatMessageId?: string };
};

export type VoiceJobView = {
  id: string;
  title: string;
  language: VoiceLanguage;
  speaker: string;
  /** What was spoken: the translation when the text was in another language. */
  spokenText: string;
  translated: boolean;
  durationSec: number;
  sizeBytes: number;
  createdAt: string;
  cached: boolean;
  charCount: number;
  settings: { pace: number; stability: number; similarity: number };
};

export type SpeakResult = { ok: true; job: VoiceJobView } | { ok: false; error: string; status: number };

const fail = (error: string, status = 400): SpeakResult => ({ ok: false, error, status });

const titleFor = (text: string, language: VoiceLanguage, given?: string) => {
  const base = (given ?? text).replace(/\s+/g, " ").trim();
  const clipped = base.length > 40 ? `${base.slice(0, 39).trimEnd()}…` : base;
  const name = { en: "English", hi: "Hindi", as: "Assamese" }[language];
  return `${clipped} · ${name}`;
};

/** Voices ElevenLabs refused recently (a library voice on a plan that cannot use it), and when. */
const blockedAt = new Map<string, number>();
const BLOCKED_MEMORY_MS = 60 * 60 * 1000;
const recentlyBlocked = (voice: string) => Date.now() - (blockedAt.get(voice) ?? 0) < BLOCKED_MEMORY_MS;

type JobRow = Awaited<ReturnType<typeof prisma.voiceJob.findFirstOrThrow>>;

function toView(j: JobRow, cached: boolean): VoiceJobView {
  const language = (["en", "hi", "as"] as const).find((l) => codeOf(l) === j.targetLanguage) ?? "en";
  return {
    id: j.id,
    title: j.title ?? "Audio",
    language,
    speaker: j.speaker ?? defaultVoice(language),
    spokenText: j.translated ?? j.inputText ?? "",
    translated: !!j.translated,
    durationSec: j.durationSec ?? 0,
    sizeBytes: j.sizeBytes ?? 0,
    createdAt: j.createdAt.toISOString(),
    cached,
    charCount: j.charCount ?? 0,
    settings: { pace: j.pace ?? 1, stability: j.stability ?? 0.5, similarity: j.similarity ?? 0.75 },
  };
}

/**
 * Turn text into speech in the chosen language and remember it. Text in another language is
 * translated first (the translation is kept and shown). Long text is cut into sentences, spoken
 * piece by piece and joined. The same text, voice and settings are only ever paid for once.
 */
export async function speak(userId: string, req: SpeakRequest, deps: { tts?: (t: string, o: TtsOptions) => Promise<{ wav: Uint8Array; speaker: string }>; translate?: TranslateFn } = {}): Promise<SpeakResult> {
  const text = req.text.replace(/\r\n/g, "\n").trim();
  if (!text) return fail("Write or paste something to read aloud.");
  if (text.length > TTS_MAX_CHARS) return fail(`Keep it under ${TTS_MAX_CHARS.toLocaleString("en-IN")} characters.`);
  if (!isVoiceLanguage(req.language)) return fail("Choose English, Hindi or Assamese.");
  if (!deps.tts && !elevenlabsConfigured()) return fail("Reading aloud is not configured.", 503);
  if (!storageConfigured()) return fail("Audio storage is not configured.", 503);

  const language = req.language;
  const speaker = req.speaker && voiceBelongsTo(req.speaker, language) ? req.speaker : defaultVoice(language);
  const settings = clampSettings(req);
  const from = textLanguage(text);

  // Same text, language, voice and settings as an earlier job of this person: reuse it.
  const model = ttsModel(language);
  const key = ttsCacheKey({ text, language, speaker, model, ...settings });
  // Audio made with the fallback voice only stands in for the chosen voice while that voice is known to be refused,
  // so it is never reused once the plan can use the voice itself.
  const earlier = await prisma.voiceJob.findFirst({ where: { userId, kind: "TTS", status: "COMPLETED", cacheKey: key, speaker: { in: recentlyBlocked(speaker) ? [speaker, FALLBACK_VOICE.id] : [speaker] }, storageKey: { not: null } }, orderBy: { createdAt: "desc" } });
  if (earlier) {
    const again = await prisma.voiceJob.create({
      data: { userId, kind: "TTS", status: "COMPLETED", title: req.title ? titleFor(text, language, req.title) : earlier.title, inputText: text, inputLanguage: earlier.inputLanguage, targetLanguage: earlier.targetLanguage, speaker, ...settings, model: earlier.model, cacheKey: key, charCount: earlier.charCount, storageKey: earlier.storageKey, audioUrl: earlier.audioUrl, mimeType: earlier.mimeType, sizeBytes: earlier.sizeBytes, durationSec: earlier.durationSec, translated: earlier.translated, ...(req.source ?? {}), completedAt: new Date() },
    });
    return { ok: true, job: toView(again, true) };
  }

  if (!(await consumeRateLimit(`tts:${userId}`, TTS_RATE.limit, TTS_RATE.windowSeconds))) return fail("You've generated a lot of audio this hour. Try again in a little while.", 429);

  try {
    let spoken = text;
    let translated: string | null = null;
    if (from !== language) {
      spoken = await (deps.translate ?? translateCodes)(text, codeOf(from), codeOf(language));
      translated = spoken;
    }
    const piece = deps.tts ?? ttsPiece;
    const wavs: Uint8Array[] = [];
    let usedSpeaker = speaker;
    for (const chunk of chunkText(spoken)) {
      const r = await piece(chunk, { language, speaker: usedSpeaker, ...settings });
      usedSpeaker = r.speaker;
      if (r.speaker !== speaker) blockedAt.set(speaker, Date.now());
      else blockedAt.delete(speaker);
      wavs.push(r.wav);
    }
    if (!wavs.length) return fail("There was nothing to read.");
    const audio = wavs.length === 1 ? wavs[0] : concatWav(wavs);

    const job = await prisma.voiceJob.create({
      data: { userId, kind: "TTS", status: "RUNNING", title: titleFor(text, language, req.title), inputText: text, inputLanguage: codeOf(from), targetLanguage: codeOf(language), speaker: usedSpeaker, ...settings, model, cacheKey: key, charCount: text.length, translated, ...(req.source ?? {}) },
    });
    const stored = await putObject(`voice/${userId}/${job.id}.wav`, audio, "audio/wav");
    const done = await prisma.voiceJob.update({ where: { id: job.id }, data: { status: "COMPLETED", storageKey: stored.key, audioUrl: stored.ref, mimeType: "audio/wav", sizeBytes: audio.byteLength, durationSec: Math.round(wavSeconds(audio) * 100) / 100, completedAt: new Date() } });
    return { ok: true, job: toView(done, false) };
  } catch (e) {
    if (e instanceof SpeechError) {
      console.error("voice: speech failed", e.status, e.message.slice(0, 200));
      return fail(e.status === 429 ? e.message : e.status === 401 || e.status === 402 || e.status === 403 ? e.message : "We couldn't generate the audio just now. Please try again.", e.status === 429 ? 429 : e.status === 402 ? 503 : 502);
    }
    if (e instanceof TranslateError) return fail(`${e.message} Try again in a moment, or choose the language the text is already in.`, 502);
    console.error("voice: failed", e instanceof Error ? e.message : e);
    return fail("We couldn't generate the audio just now. Please try again.", 502);
  }
}

/** The person's recent audio, newest first. */
export async function listVoiceJobs(userId: string, take = 30): Promise<VoiceJobView[]> {
  const rows = await prisma.voiceJob.findMany({ where: { userId, kind: "TTS", status: "COMPLETED", storageKey: { not: null } }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => toView(r, false));
}

/** The storage key of a job's audio, only for its owner. */
export async function voiceAudioKey(userId: string, id: string) {
  const j = await prisma.voiceJob.findFirst({ where: { id, userId, status: "COMPLETED" }, select: { storageKey: true, title: true } });
  return j?.storageKey ? { key: j.storageKey, title: j.title ?? "audio" } : null;
}

/** Delete a job. The audio file goes too unless another job of the same person still uses it. */
export async function deleteVoiceJob(userId: string, id: string): Promise<boolean> {
  const j = await prisma.voiceJob.findFirst({ where: { id, userId }, select: { id: true, storageKey: true } });
  if (!j) return false;
  await prisma.voiceJob.delete({ where: { id: j.id } });
  if (j.storageKey && !(await prisma.voiceJob.count({ where: { storageKey: j.storageKey } }))) await deleteObject(j.storageKey).catch(() => undefined);
  return true;
}
