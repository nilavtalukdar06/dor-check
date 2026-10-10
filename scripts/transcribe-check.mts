// Voice reporting against the real ElevenLabs API (Scribe), Gemini translation, storage and database:
// speech to text, language detection, translation, a long clip, limits, and linking a recording to
// a report. Test clips are made with ElevenLabs voices, including a real Assamese one. Texts are kept
// short because the free ElevenLabs plan allows 10,000 characters a month. Cleans up after itself.
import prismaModule from "../src/lib/prisma";
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { reportInputSchema } from "../src/lib/reports";
import { defaultVoice } from "../src/lib/voice";
import { concatWav, encodeWav } from "../src/lib/wav";
import { createReport } from "../src/server/reports";
import { ttsPiece } from "../src/server/elevenlabs";
import { deleteObject, getObjectBytes } from "../src/server/storage";
import { transcribeClip } from "../src/server/transcribe";

let fails = 0;
const check = (name: string, ok: unknown, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)?.slice(0, 500)}`);
  if (!ok) fails++;
};

const HI = "मुझसे एक लिंक भेजकर निजी यूपीआई आईडी पर अग्रिम भुगतान करने को कहा गया था। पेज बाद में गायब हो गया।";
const EN = "I was asked to pay an advance to a personal UPI id after receiving a booking link on WhatsApp.";
const AS = "মোক এটা লিংক পঠিয়াই আগতীয়াকৈ ধন দিবলৈ কৈছিল। পেজটো পিছত নোহোৱা হ'ল।";
const clip = async (text: string, language: "hi" | "en" | "as") => (await ttsPiece(text, { language, speaker: defaultVoice(language), pace: 1, stability: 0.5, similarity: 0.75 })).wav;

async function main() {
  const mk = (tag: string) => prisma.user.create({ data: { clerkId: `stt_${tag}_${Date.now()}`, email: `ttd-e2e-stt-${tag}@example.com`, name: `Stt ${tag}` } });
  const [a, b] = [await mk("a"), await mk("b")];
  const ids = [a.id, b.id];
  for (const u of [a, b]) await prisma.workspace.create({ data: { ownerId: u.id, isPersonal: true } });
  const keys: string[] = [];

  try {
    const hiWav = await clip(HI, "hi");
    const hi = await transcribeClip(a.id, hiWav);
    check("a Hindi recording is transcribed in Hindi and the language is detected", hi.ok && hi.job.language === "hi-IN" && hi.job.languageName === "Hindi" && /यूपीआई|यूपी|UPI/.test(hi.job.transcript) && /[ऀ-ॿ]{4}/.test(hi.job.transcript), hi);
    if (!hi.ok) return;
    check("it also comes with an English version that says the same thing", !!hi.job.translated && /advance|payment/i.test(hi.job.translated) && /UPI/i.test(hi.job.translated), hi.job.translated);
    const row = await prisma.voiceJob.findUniqueOrThrow({ where: { id: hi.job.id } });
    keys.push(row.storageKey!);
    check("the job keeps the recording, both texts and the language, privately for its owner", row.kind === "STT" && row.status === "COMPLETED" && row.userId === a.id && row.detectedLanguage === "hi-IN" && row.transcript === hi.job.transcript && row.translated === hi.job.translated && (row.durationSec ?? 0) > 3 && (await getObjectBytes(row.storageKey!)).byteLength === hiWav.byteLength, row);

    const enWav = await clip(EN, "en");
    const en = await transcribeClip(a.id, enWav);
    check("an English recording is transcribed and needs no translation", en.ok && en.job.language === "en-IN" && en.job.translated === null && /advance/i.test(en.job.transcript), en);
    if (en.ok) keys.push((await prisma.voiceJob.findUniqueOrThrow({ where: { id: en.job.id } })).storageKey!);

    // Assamese: the point of the switch.
    const asWav = await clip(AS, "as");
    const asr = await transcribeClip(a.id, asWav);
    check("an Assamese recording is transcribed in Assamese script and detected as Assamese", asr.ok && asr.job.language === "as-IN" && asr.job.languageName === "Assamese" && /[\u0980-\u09FF]{4}/.test(asr.job.transcript), asr);
    check("it comes with an English version", asr.ok && !!asr.job.translated && /link|advance|money|page/i.test(asr.job.translated), asr.ok && asr.job.translated);
    if (asr.ok) keys.push((await prisma.voiceJob.findUniqueOrThrow({ where: { id: asr.job.id } })).storageKey!);

    // A long recording needs no cutting: Scribe reads the whole clip.
    const long = concatWav([hiWav, hiWav, hiWav, hiWav, hiWav, hiWav]);
    const lg = await transcribeClip(a.id, long);
    check("a long recording (over 30 seconds) is read as one text", lg.ok && lg.job.durationSec > 26 && (lg.job.transcript.match(/यूपीआई|यूपी|UPI/g) ?? []).length >= 2, lg.ok ? [lg.job.durationSec, lg.job.transcript.slice(0, 200)] : lg);
    if (lg.ok) keys.push((await prisma.voiceJob.findUniqueOrThrow({ where: { id: lg.job.id } })).storageKey!);

    // When translation is down the transcript is still returned.
    const noTranslate = await transcribeClip(a.id, hiWav, { translate: async () => { throw new Error("down"); } });
    check("if the English version cannot be made, the transcript is still returned", noTranslate.ok && noTranslate.job.translated === null && /[\u0900-\u097F]{4}/.test(noTranslate.job.transcript), noTranslate);
    if (noTranslate.ok) keys.push((await prisma.voiceJob.findUniqueOrThrow({ where: { id: noTranslate.job.id } })).storageKey!);

    // Bad input
    check("a recording that is too short is refused", !(await transcribeClip(a.id, encodeWav(new Int16Array(4000), 16000))).ok);
    check("a recording over two minutes is refused", !(await transcribeClip(a.id, encodeWav(new Int16Array(16000 * 130), 16000))).ok);
    check("something that is not audio is refused", !(await transcribeClip(a.id, new Uint8Array([1, 2, 3, 4, 5, 6]))).ok);
    const silent = await transcribeClip(a.id, encodeWav(new Int16Array(16000 * 3), 16000));
    check("silence gets a helpful message and nothing is saved", !silent.ok && /couldn't hear/.test(silent.error) && (await prisma.voiceJob.count({ where: { userId: a.id, kind: "STT" } })) === 5, silent);

    // A report spoken from a recording keeps it
    const district = await prisma.district.findFirstOrThrow({ where: { name: "East Khasi Hills" } });
    const input = reportInputSchema.parse({ kind: "SCAM", category: "STAY", summary: "Asked for an advance to a personal UPI id", description: `${hi.job.transcript}\n\n${hi.job.translated}`, districtId: district.id, evidenceIds: [], isAnonymous: true, voiceJobId: hi.job.id });
    const rep = await createReport(a, input);
    check("the report is created from the spoken text", rep.ok, rep);
    if (rep.ok) {
      check("the recording is linked to the report", (await prisma.voiceJob.findUniqueOrThrow({ where: { id: hi.job.id } })).reportId === rep.id);
      const stolen = await createReport(b, reportInputSchema.parse({ ...input, summary: "Someone else's recording should not attach" }));
      check("another person cannot attach someone else's recording", stolen.ok && (await prisma.voiceJob.findUniqueOrThrow({ where: { id: hi.job.id } })).reportId === rep.id && (await prisma.voiceJob.count({ where: { reportId: stolen.id } })) === 0, stolen);
    }

    // Limit
    const now = Date.now();
    const windowStart = new Date(now - (now % 3600000));
    await prisma.rateLimitBucket.upsert({ where: { key_windowStart: { key: `stt:${b.id}`, windowStart } }, create: { key: `stt:${b.id}`, windowStart, count: 10 }, update: { count: 10 } });
    const limited = await transcribeClip(b.id, enWav);
    check("too many recordings in an hour is refused with a plain message", !limited.ok && limited.status === 429, limited);
  } finally {
    const rows = await prisma.voiceJob.findMany({ where: { userId: { in: ids } }, select: { storageKey: true } });
    for (const k of new Set([...keys, ...rows.map((r) => r.storageKey).filter((k): k is string => !!k)])) await deleteObject(k).catch(() => undefined);
    const reports = await prisma.report.findMany({ where: { reporterId: { in: ids } }, select: { id: true } });
    const idents = await prisma.reportIdentifier.findMany({ where: { reportId: { in: reports.map((r) => r.id) } }, select: { identifierId: true } });
    await prisma.rateLimitBucket.deleteMany({ where: { key: { in: ids.flatMap((i) => [`stt:${i}`, `report:${i}`]) } } }).catch(() => undefined);
    await prisma.report.deleteMany({ where: { reporterId: { in: ids } } });
    await prisma.identifier.deleteMany({ where: { id: { in: idents.map((i) => i.identifierId) }, properties: { none: {} }, reports: { none: {} }, investigations: { none: {} } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    check("cleanup: nothing left behind", (await prisma.voiceJob.count({ where: { userId: { in: ids } } })) === 0 && (await prisma.report.count({ where: { reporterId: { in: ids } } })) === 0);
  }
}

main()
  .catch((e) => { console.error(e); fails++; })
  .finally(() => {
    console.log(fails ? `\n${fails} FAILED` : "\nAll transcription checks passed");
    process.exit(fails ? 1 : 0);
  });
