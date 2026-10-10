import { describe, expect, it } from "vitest";
import { chunkText, refineLanguage, modelTakesLanguage, modelTakesSpeed, paceSupported, TTS_MODELS, clampSettings, clock, codeFromIso, codeOf, concatWav, defaultVoice, FALLBACK_VOICE, languageFromCode, parseWav, textLanguage, ttsCacheKey, verdictSpeech, voiceBelongsTo, voiceName, wavSeconds } from "./voice";

function wav(samples: number, rate = 22050) {
  const data = new Uint8Array(samples * 2).map((_, i) => i % 251);
  const out = new Uint8Array(44 + data.length);
  const dv = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + data.length, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, data.length, true); out.set(data, 44);
  return out;
}

describe("chunkText", () => {
  it("keeps short text whole and drops empties", () => {
    expect(chunkText("Hello there.")).toEqual(["Hello there."]);
    expect(chunkText("   \n ")).toEqual([]);
  });
  it("cuts at sentence ends and keeps every piece under the limit", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something useful.`).join(" ");
    const parts = chunkText(text, 200);
    expect(parts.length).toBeGreaterThan(5);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(200);
    expect(parts.join(" ")).toBe(text);
    expect(parts.slice(0, -1).every((p) => /[.!?]$/.test(p))).toBe(true);
  });
  it("splits Hindi and Assamese sentence ends and a sentence longer than the limit", () => {
    expect(chunkText("पहला वाक्य। दूसरा वाक्य।", 14)).toEqual(["पहला वाक्य।", "दूसरा वाक्य।"]);
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const parts = chunkText(long, 100);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join(" ")).toBe(long);
  });
});

describe("settings and keys", () => {
  it("clamps to ElevenLabs' ranges", () => {
    expect(clampSettings({ pace: 9, stability: -3, similarity: 9 })).toEqual({ pace: 1.2, stability: 0, similarity: 1 });
    expect(clampSettings({})).toEqual({ pace: 1, stability: 0.5, similarity: 0.75 });
    expect(clampSettings({ pace: Number.NaN }).pace).toBe(0.7);
  });
  it("gives the same key for the same audio and a different one otherwise", () => {
    const base = { text: " Hello ", language: "en" as const, speaker: "s", model: "m", pace: 1, stability: 0.5, similarity: 0.75 };
    expect(ttsCacheKey(base)).toBe(ttsCacheKey({ ...base, text: "Hello" }));
    for (const change of [{ text: "Hi" }, { language: "hi" as const }, { speaker: "t" }, { pace: 1.2 }, { stability: 0.9 }, { similarity: 0.2 }, { model: "n" }]) expect(ttsCacheKey({ ...base, ...change })).not.toBe(ttsCacheKey(base));
  });
  it("knows the languages and voices", () => {
    expect(codeOf("as")).toBe("as-IN");
    expect(languageFromCode("hi-IN")).toBe("hi");
    expect(languageFromCode("ta-IN")).toBe("en");
    expect(voiceBelongsTo(defaultVoice("as"), "as")).toBe(true);
    expect(voiceBelongsTo(defaultVoice("as"), "hi")).toBe(false);
    expect(defaultVoice("as")).toBe("eBjbdlli9b8tJL1ng9Vx");
    expect(defaultVoice("hi")).toBe("X1aCu8g69vgtNfFwu68G");
    expect(defaultVoice("en")).toBe("ZbxPfVOKktgkLqi5LCBx");
    expect(voiceName("eBjbdlli9b8tJL1ng9Vx")).toBe("Priyanka");
    expect(voiceName(FALLBACK_VOICE.id)).toBe("Sarah");
    expect(codeFromIso("asm")).toBe("as-IN");
    expect(codeFromIso("hin")).toBe("hi-IN");
    expect(codeFromIso("eng")).toBe("en-IN");
    expect(codeFromIso(undefined)).toBeNull();
    expect(textLanguage("शिलांग का किराया कितना है")).toBe("hi");
  });
});

describe("refineLanguage", () => {
  it("calls Bengali-detected text Assamese when it has Assamese letters", () => {
    expect(refineLanguage("bn-IN", "মোক এটা লিংক পঠিয়াই আগতীয়াকৈ ধন দিবলৈ কৈছিল। নোহোৱা")).toBe("as-IN");
    expect(refineLanguage("bn-IN", "আমি বাংলায় কথা বলছি")).toBe("bn-IN");
    expect(refineLanguage("hi-IN", "ৰ")).toBe("hi-IN");
    expect(refineLanguage(null, "ৰ")).toBeNull();
  });
});

describe("models", () => {
  it("uses the model that speaks each language and only sends what it accepts", () => {
    expect(TTS_MODELS.as).toBe("eleven_v3");
    expect(modelTakesLanguage("eleven_v3")).toBe(true);
    expect(modelTakesLanguage("eleven_multilingual_v2")).toBe(false);
    expect(modelTakesSpeed("eleven_v3")).toBe(false);
    expect(modelTakesSpeed("eleven_multilingual_v2")).toBe(true);
    expect(paceSupported("en")).toBe(true);
    expect(paceSupported("hi")).toBe(true);
    expect(paceSupported("as")).toBe(false);
  });
});

describe("wav", () => {
  it("reads a file and its length", () => {
    const w = wav(22050);
    expect(parseWav(w)).toMatchObject({ sampleRate: 22050, channels: 1, bitsPerSample: 16 });
    expect(wavSeconds(w)).toBeCloseTo(1, 5);
  });
  it("joins files into one of the combined length", () => {
    const joined = concatWav([wav(11025), wav(22050), wav(11025)]);
    expect(wavSeconds(joined)).toBeCloseTo(2, 5);
    expect(parseWav(joined).data.length).toBe((11025 + 22050 + 11025) * 2);
  });
  it("refuses mismatched or broken input", () => {
    expect(() => concatWav([wav(10, 22050), wav(10, 16000)])).toThrow(/differ/);
    expect(() => parseWav(new Uint8Array(10))).toThrow();
    expect(() => concatWav([])).toThrow();
  });
});

describe("speech helpers", () => {
  it("formats a clock", () => {
    expect(clock(12.4)).toBe("0:12");
    expect(clock(65)).toBe("1:05");
  });
  it("turns a verdict into plain spoken sentences", () => {
    const s = verdictSpeech({ title: "demohills.example", concern: "HIGH", summary: "Not in the directory.", guidance: ["Do not pay an advance.", "Call 1930 if you paid."] });
    expect(s).toBe("demohills.example. High concern. Not in the directory. What to do now. Step 1. Do not pay an advance. Step 2. Call 1930 if you paid.");
  });
});
