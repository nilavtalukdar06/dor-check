import prisma from "@/lib/prisma";
import { parseWav, wavSeconds } from "@/lib/wav";
import { RECORD_MAX_SEC, RECORD_MIN_SEC, refineLanguage, spokenLanguageName, STT_RATE } from "@/lib/voice";
import { consumeRateLimit } from "@/server/rate-limit";
import { recordVoiceSeconds } from "@/server/settings";
import { elevenlabsConfigured, SpeechError, sttClip } from "@/server/elevenlabs";
import { translateCodes, type TranslateFn } from "@/server/translate";
import { putObject, storageConfigured } from "@/server/storage";

export type TranscribeResult =
  | { ok: true; job: { id: string; transcript: string; translated: string | null; language: string | null; languageName: string; durationSec: number } }
  | { ok: false; error: string; status: number };

const fail = (error: string, status = 400): TranscribeResult => ({ ok: false, error, status });

export type TranscribeDeps = { stt?: typeof sttClip; translate?: TranslateFn };

/**
 * A recorded report to text. Scribe reads the whole clip and detects the language, and anything
 * not in English is translated to English. The recording is kept, privately, with
 * both texts, so a moderator can check the transcript against what was actually said.
 */
export async function transcribeClip(userId: string, audio: Uint8Array, deps: TranscribeDeps = {}): Promise<TranscribeResult> {
  if (!deps.stt && !elevenlabsConfigured()) return fail("Voice reporting is not configured.", 503);
  if (!storageConfigured()) return fail("Audio storage is not configured.", 503);

  let info;
  try {
    info = parseWav(audio);
  } catch {
    return fail("That recording couldn't be read. Try again.");
  }
  if (info.channels !== 1 || info.bitsPerSample !== 16) return fail("That recording couldn't be read. Try again.");
  const seconds = wavSeconds(audio);
  if (seconds < RECORD_MIN_SEC) return fail("That was too short. Hold on a little longer and speak.");
  if (seconds > RECORD_MAX_SEC + 2) return fail(`Recordings can be up to ${RECORD_MAX_SEC / 60} minutes.`);
  if (!(await consumeRateLimit(`stt:${userId}`, STT_RATE.limit, STT_RATE.windowSeconds))) return fail("You've made a lot of recordings this hour. Try again in a little while, or type your report.", 429);

  try {
    const heard = await (deps.stt ?? sttClip)(audio);
    const transcript = heard.transcript;
    const language = refineLanguage(heard.language, transcript);
    if (!transcript) return fail("We couldn't hear any speech in that recording. Move closer to the microphone and try again.");

    // The transcript is what matters: if the English version cannot be made, still return the transcript.
    let translated: string | null = null;
    if (language && language !== "en-IN") {
      translated = await (deps.translate ?? translateCodes)(transcript, language, "en-IN").catch((e) => {
        console.error("transcribe: translation failed", e instanceof Error ? e.message : e);
        return null;
      });
    }

    const job = await prisma.voiceJob.create({
      data: { userId, kind: "STT", status: "RUNNING", title: `Voice report · ${spokenLanguageName(language)}`, model: "scribe_v2", mimeType: "audio/wav", sizeBytes: audio.byteLength, durationSec: Math.round(seconds * 100) / 100 },
    });
    const stored = await putObject(`voice/${userId}/${job.id}.wav`, audio, "audio/wav");
    await prisma.voiceJob.update({ where: { id: job.id }, data: { status: "COMPLETED", storageKey: stored.key, audioUrl: stored.ref, transcript, translated, detectedLanguage: language, completedAt: new Date() } });
    await recordVoiceSeconds(userId, seconds).catch(() => undefined);
    return { ok: true, job: { id: job.id, transcript, translated, language, languageName: spokenLanguageName(language), durationSec: Math.round(seconds * 10) / 10 } };
  } catch (e) {
    if (e instanceof SpeechError) {
      console.error("transcribe: speech failed", e.status, e.message.slice(0, 200));
      return fail(e.status === 429 ? e.message : "We couldn't transcribe that just now. You can try again or type your report.", e.status === 429 ? 429 : 502);
    }
    console.error("transcribe: failed", e instanceof Error ? e.message : e);
    return fail("We couldn't transcribe that just now. You can try again or type your report.", 502);
  }
}
