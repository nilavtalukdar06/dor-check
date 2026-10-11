"use client";

import { useState } from "react";
import { Row, SavedNote, SliderRow, ToggleRow, useSave } from "@/components/settings/controls";
import { NativeSelect } from "@/components/ui/native-select";
import { PREFERRED_LANGUAGES, voiceLanguageOf, type PreferencePatch } from "@/lib/settings";
import { PACE, paceSupported, SIMILARITY, STABILITY, VOICES } from "@/lib/voice";

export type LangValues = { language: string; defaultVoice: string; speechPace: number; speechStability: number; speechSimilarity: number; autoReadVerdicts: boolean };

export function LanguageTab({ initial }: { initial: LangValues }) {
  const { state, save } = useSave();
  const [v, setV] = useState(initial);
  const lang = voiceLanguageOf(v.language);
  const voices = VOICES[lang];
  const update = (patch: Partial<LangValues> & PreferencePatch) => {
    setV((x) => ({ ...x, ...patch } as LangValues));
    save(patch);
  };
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2" data-testid="tab-language">
      <section aria-label="Language and voice" className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Row title="Preferred language" hint="Used for assistant replies and read-aloud" htmlFor="pref-language">
          <NativeSelect id="pref-language" className="w-44" value={v.language} onChange={(e) => update({ language: e.target.value as PreferencePatch["language"], defaultVoice: VOICES[voiceLanguageOf(e.target.value)][0].id })}>
            {PREFERRED_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </NativeSelect>
        </Row>
        <Row title="Default voice" hint="ElevenLabs voice for read-aloud" htmlFor="pref-voice">
          <NativeSelect id="pref-voice" className="w-44" value={voices.some((x) => x.id === v.defaultVoice) ? v.defaultVoice : voices[0].id} onChange={(e) => update({ defaultVoice: e.target.value })}>
            {voices.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.note}</option>)}
          </NativeSelect>
        </Row>
        <ToggleRow id="auto-read" title="Auto read verdicts" hint="Speak the verdict when you open a finished check" checked={v.autoReadVerdicts} onChange={(x) => update({ autoReadVerdicts: x })} />
        <div className="flex justify-end px-5 py-2"><SavedNote {...state} /></div>
      </section>
      <section aria-label="Read-aloud voice settings" className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="border-b px-5 py-4"><h2 className="text-[15px] font-semibold">Read-aloud settings</h2><p className="text-[13px] text-muted-foreground">Where Read aloud starts. You can change them on the Read aloud screen too.</p></div>
        <SliderRow id="pref-pace" label="Pace" value={v.speechPace} display={`${v.speechPace.toFixed(2)}x`} {...PACE} low="Slower" high="Faster" disabled={!paceSupported(lang)} hint={paceSupported(lang) ? undefined : "The Assamese voice sets its own pace."} onCommit={(x) => update({ speechPace: Math.round(x * 100) / 100 })} />
        <SliderRow id="pref-stability" label="Stability" value={v.speechStability} display={v.speechStability.toFixed(2)} {...STABILITY} low="More expressive" high="More even" onCommit={(x) => update({ speechStability: Math.round(x * 100) / 100 })} />
        <SliderRow id="pref-similarity" label="Similarity" value={v.speechSimilarity} display={v.speechSimilarity.toFixed(2)} {...SIMILARITY} low="Looser" high="Closer to the voice" onCommit={(x) => update({ speechSimilarity: Math.round(x * 100) / 100 })} />
      </section>
    </div>
  );
}
