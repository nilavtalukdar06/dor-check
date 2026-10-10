import { describe, expect, it } from "vitest";
import { sniffImage } from "./image-info";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

describe("sniffImage", () => {
  it("reads a PNG and its size", () => {
    const png = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], be32(13), "IHDR", be32(1280), be32(800), [8, 6, 0, 0, 0]);
    expect(sniffImage(png)).toEqual({ mime: "image/png", ext: "png", width: 1280, height: 800 });
  });

  it("reads a JPEG frame header after other segments", () => {
    const jpeg = bytes([0xff, 0xd8], [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46], [0xff, 0xc0, 0x00, 0x11, 8], [0x02, 0x58], [0x03, 0x20], [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    expect(sniffImage(jpeg)).toEqual({ mime: "image/jpeg", ext: "jpg", width: 800, height: 600 });
  });

  it("reads WebP (extended header)", () => {
    const webp = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0, 0, 0, 0], [0x7f, 0x02, 0], [0x55, 0x01, 0]);
    expect(sniffImage(webp)).toEqual({ mime: "image/webp", ext: "webp", width: 640, height: 342 });
  });

  it("rejects other files, whatever they are called", () => {
    expect(sniffImage(bytes("%PDF-1.7 and some more bytes to be long enough"))).toBeNull();
    expect(sniffImage(bytes("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(sniffImage(bytes("GIF89a", [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("does not trust a truncated PNG", () => {
    expect(sniffImage(bytes([0x89], "PNG", [0x0d, 0x0a]))).toBeNull();
  });
});
