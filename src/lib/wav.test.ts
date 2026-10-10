import { describe, expect, it } from "vitest";
import { encodeWav, parseWav, resampleToInt16, wavSeconds } from "./wav";

const RATE = 16000;
/** A tone of `sec` seconds. */
function tone(sec: number) {
  const s = new Int16Array(Math.floor(sec * RATE));
  for (let i = 0; i < s.length; i++) s[i] = Math.round(Math.sin(i / 7) * 12000);
  return s;
}

describe("encodeWav and resampleToInt16", () => {
  it("writes a file that reads back with the same samples and length", () => {
    const s = tone(1);
    const wav = encodeWav(s, RATE);
    expect(parseWav(wav)).toMatchObject({ sampleRate: RATE, channels: 1, bitsPerSample: 16 });
    expect(wavSeconds(wav)).toBeCloseTo(1, 5);
    expect(new Int16Array(parseWav(wav).data.buffer.slice(parseWav(wav).data.byteOffset))[100]).toBe(s[100]);
  });
  it("converts microphone floats at 48 kHz to 16 kHz 16-bit", () => {
    const chunks = [new Float32Array(24000).fill(0.5), new Float32Array(24000).fill(-0.5)];
    const out = resampleToInt16(chunks, 48000, 16000);
    expect(out.length).toBe(16000);
    expect(out[0]).toBeGreaterThan(16000);
    expect(out[out.length - 1]).toBeLessThan(-16000);
  });
  it("clips instead of wrapping", () => {
    const out = resampleToInt16([new Float32Array([2, -2, 2, -2])], 16000, 16000);
    expect([...out]).toEqual([32767, -32768, 32767, -32768]);
  });
});
