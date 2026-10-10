import { Suspense } from "react";
import { VoiceStudio } from "@/components/voice/voice-studio";
import { VoiceSkeleton } from "@/components/voice/voice-skeleton";
import prisma from "@/lib/prisma";
import { withBaselineGuidance } from "@/lib/verdict";
import { clampSettings, defaultVoice, languageFromCode, TTS_MAX_CHARS, verdictSpeech, voiceBelongsTo } from "@/lib/voice";
import { getCurrentUser } from "@/server/users";
import { listVoiceJobs } from "@/server/voice";

export const metadata = { title: "Read aloud" };

async function Studio({ searchParams }: Pick<PageProps<"/voice">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sp = await searchParams;
  const [pref, history, finished] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    listVoiceJobs(user.id),
    prisma.investigation.findMany({
      where: { userId: user.id, deletedAt: null, result: { isNot: null } },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: { id: true, title: true, result: { select: { concern: true, summary: true, guidance: true } } },
    }),
  ]);

  const verdicts = finished.flatMap((i) => (i.result ? [{ id: i.id, title: i.title, text: verdictSpeech({ title: i.title, concern: i.result.concern, summary: i.result.summary, guidance: withBaselineGuidance(i.result.guidance) }) }] : []));
  // Arriving from a verdict or with text in the address: start with that text.
  const wanted = typeof sp.investigation === "string" ? verdicts.find((v) => v.id === sp.investigation)?.text : null;
  const text = (wanted ?? (typeof sp.text === "string" ? sp.text : "")).slice(0, TTS_MAX_CHARS);

  const language = languageFromCode(pref?.language);
  const speaker = pref && voiceBelongsTo(pref.defaultVoice, language) ? pref.defaultVoice : defaultVoice(language);
  return <VoiceStudio initialText={text} initialLanguage={language} initialSpeaker={speaker} initialSettings={clampSettings({ pace: pref?.speechPace })} history={history} verdicts={verdicts} />;
}

export default function VoicePage({ searchParams }: PageProps<"/voice">) {
  return (
    <Suspense fallback={<VoiceSkeleton />}>
      <Studio searchParams={searchParams} />
    </Suspense>
  );
}
