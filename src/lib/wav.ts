// WAV files: reading, joining, cutting and writing 16-bit PCM. Pure and free of Node APIs, so the
// browser (which records and encodes) and the server (which splits long clips) share it.



export type WavInfo = { sampleRate: number; channels: number; bitsPerSample: number; data: Uint8Array };

/** Read a PCM WAV file: its format and the sample bytes. Throws on anything that is not one. */
export function parseWav(bytes: Uint8Array): WavInfo {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
  let fmt: { sampleRate: number; channels: number; bitsPerSample: number } | null = null;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = tag(pos);
    const size = dv.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") fmt = { channels: dv.getUint16(body + 2, true), sampleRate: dv.getUint32(body + 4, true), bitsPerSample: dv.getUint16(body + 14, true) };
    if (id === "data") {
      if (!fmt) throw new Error("WAV data before format");
      // Some encoders leave the size at 0 or too big when streaming: use what is there.
      const end = size === 0 || body + size > bytes.length ? bytes.length : body + size;
      return { ...fmt, data: bytes.subarray(body, end) };
    }
    pos = body + size + (size % 2);
  }
  throw new Error("WAV has no data");
}

/** Join WAV files of the same format into one. */
export function concatWav(files: Uint8Array[]): Uint8Array {
  if (!files.length) throw new Error("Nothing to join");
  const parts = files.map(parseWav);
  const { sampleRate, channels, bitsPerSample } = parts[0];
  if (parts.some((p) => p.sampleRate !== sampleRate || p.channels !== channels || p.bitsPerSample !== bitsPerSample)) throw new Error("Audio pieces differ in format");
  const total = parts.reduce((n, p) => n + p.data.length, 0);
  const out = new Uint8Array(44 + total);
  const dv = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  const blockAlign = (channels * bitsPerSample) / 8;
  w(0, "RIFF");
  dv.setUint32(4, 36 + total, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  w(36, "data");
  dv.setUint32(40, total, true);
  let at = 44;
  for (const p of parts) {
    out.set(p.data, at);
    at += p.data.length;
  }
  return out;
}

export function wavSeconds(bytes: Uint8Array): number {
  const { sampleRate, channels, bitsPerSample, data } = parseWav(bytes);
  return data.length / (sampleRate * channels * (bitsPerSample / 8));
}


/** Write 16-bit mono PCM samples as a WAV file. */
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const dv = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, "RIFF");
  dv.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, "data");
  dv.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, samples[i], true);
  return out;
}

/** Microphone samples (float, any rate) to 16-bit mono at `to` Hz, averaging when slowing down. */
export function resampleToInt16(chunks: Float32Array[], from: number, to: number): Int16Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    input.set(c, at);
    at += c.length;
  }
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / (end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}
