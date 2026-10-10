export type ImageInfo = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp"; width: number | null; height: number | null };

const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

/**
 * What an uploaded file really is, from its own bytes (the browser's file name and type are
 * not trusted). Only PNG, JPEG and WebP are accepted; anything else returns null.
 */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && ascii(bytes, 12, 4) === "IHDR") {
    return { mime: "image/png", ext: "png", width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    // Walk the marker segments to the first frame header (SOF0..SOF15 except DHT/JPG/DAC).
    let o = 2;
    while (o + 9 < bytes.length) {
      if (bytes[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = bytes[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
        o += marker === 0xff ? 1 : 2;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: "image/jpeg", ext: "jpg", height: u16be(bytes, o + 5), width: u16be(bytes, o + 7) };
      }
      o += 2 + u16be(bytes, o + 2);
    }
    return { mime: "image/jpeg", ext: "jpg", width: null, height: null };
  }

  if (bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X") return { mime: "image/webp", ext: "webp", width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
    if (chunk === "VP8 ") return { mime: "image/webp", ext: "webp", width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { mime: "image/webp", ext: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    return { mime: "image/webp", ext: "webp", width: null, height: null };
  }

  return null;
}
