import { describe, expect, it } from "vitest";
import { evidenceHref, evidenceParamsSchema, formatBytes, formatStamp, kindsFor, slug } from "./evidence";

describe("evidence URL params", () => {
  it("falls back to defaults for anything unknown", () => {
    expect(evidenceParamsSchema.parse({ type: "nope", q: "  ", item: "../x", capture: ["abc123"] })).toEqual({
      type: "all",
      q: undefined,
      item: undefined,
      capture: "abc123",
    });
  });

  it("builds short URLs and round-trips", () => {
    expect(evidenceHref({})).toBe("/evidence");
    expect(evidenceHref({ type: "all" })).toBe("/evidence");
    const href = evidenceHref({ type: "uploads", q: "kaziranga", item: "ck1" });
    expect(href).toBe("/evidence?type=uploads&q=kaziranga&item=ck1");
    expect(evidenceParamsSchema.parse(Object.fromEntries(new URL(href, "http://x").searchParams))).toMatchObject({ type: "uploads", q: "kaziranga", item: "ck1" });
  });

  it("maps tabs to kinds", () => {
    expect(kindsFor("all")).toBeUndefined();
    expect(kindsFor("uploads")).toEqual(["UPLOAD", "DOCUMENT"]);
    expect(kindsFor("audio")).toEqual(["AUDIO"]);
  });
});

describe("formatting", () => {
  it("shows the capture time in Indian time, to the second", () => {
    expect(formatStamp(new Date("2026-10-10T05:11:19Z"))).toBe("10 Oct 10:41:19");
  });
  it("formats sizes and file names", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(340 * 1024)).toBe("340 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(slug("Listing page / Hotel Kaziranga!")).toBe("listing-page-hotel-kaziranga");
    expect(slug("???")).toBe("evidence");
  });
});
