import { describe, expect, it } from "vitest";
import { BADGE, channelIdFor, COMMENT_MAX, isHeld, screenComment } from "./comments";

describe("screenComment", () => {
  it("accepts a normal comment and tidies whitespace", () => {
    expect(screenComment("  I stayed there last week.\r\n\n\n\nSame story.  ")).toEqual({ verdict: "ok", body: "I stayed there last week.\n\nSame story." });
  });
  it("rejects empty and over-long comments", () => {
    expect(screenComment("   ").verdict).toBe("reject");
    expect(screenComment("a".repeat(COMMENT_MAX + 1)).verdict).toBe("reject");
    expect(screenComment("ab ".repeat(COMMENT_MAX).slice(0, COMMENT_MAX)).verdict).toBe("ok");
  });
  it("rejects phone numbers, UPI ids and emails", () => {
    for (const t of ["call 98765 43210", "pay rajesh@okaxis", "mail me at a.b@gmail.com", "+91 9876543210 is theirs"]) {
      expect(screenComment(t).verdict, t).toBe("reject");
    }
  });
  it("holds links for a moderator", () => {
    const r = screenComment("see https://example.com/page");
    expect(r).toMatchObject({ verdict: "hold", reason: "Contains a link" });
    expect(screenComment("look at demohills-homestay.example").verdict).toBe("hold");
  });
  it("holds abuse but not innocent words that contain it", () => {
    expect(screenComment("you are a bastard").verdict).toBe("hold");
    expect(screenComment("The Scunthorpe classic and a passage").verdict).toBe("ok");
  });
  it("holds obvious spam", () => {
    expect(screenComment("aaaaaaaaaaaaaaaa").verdict).toBe("hold");
  });
});

describe("helpers", () => {
  it("knows a held comment", () => {
    expect(isHeld({ status: "FLAGGED", streamMessageId: null })).toBe(true);
    expect(isHeld({ status: "FLAGGED", streamMessageId: "x" })).toBe(false);
    expect(isHeld({ status: "VISIBLE", streamMessageId: null })).toBe(false);
  });
  it("badges staff as Official", () => {
    expect(BADGE.MODERATOR).toBe("Official");
    expect(BADGE.TRAVELLER).toBe("Traveller");
  });
  it("builds the channel id the report stores", () => {
    expect(channelIdFor("TTD-ABC234")).toBe("report-TTD-ABC234");
  });
});
