import { describe, expect, it } from "vitest";
import { assistantMode, displayNameSchema, NOTIFICATION_GROUP, preferenceSchema, voiceLanguageOf } from "./settings";

describe("preferences", () => {
  it("maps a preferred language to the assistant chip and the read-aloud language", () => {
    expect(assistantMode("as-IN")).toBe("as");
    expect(assistantMode("hi-IN")).toBe("hi");
    expect(assistantMode("en-IN")).toBe("en");
    expect(assistantMode("auto")).toBe("auto");
    expect(assistantMode(null)).toBe("auto");
    expect(voiceLanguageOf("as-IN")).toBe("as");
    expect(voiceLanguageOf("auto")).toBe("en");
  });
  it("accepts a partial update and refuses bad values", () => {
    expect(preferenceSchema.safeParse({ notifyRunAlerts: false }).success).toBe(true);
    expect(preferenceSchema.safeParse({ language: "fr-FR" }).success).toBe(false);
    expect(preferenceSchema.safeParse({ speechPace: 3 }).success).toBe(false);
    expect(preferenceSchema.safeParse({ speechStability: -1 }).success).toBe(false);
    expect(preferenceSchema.safeParse({ defaultVoice: "not-a-voice" }).success).toBe(false);
    expect(preferenceSchema.safeParse({ defaultVoice: "eBjbdlli9b8tJL1ng9Vx" }).success).toBe(true);
  });
  it("strips unknown fields so they are never written", () => {
    const r = preferenceSchema.parse({ notifyRunAlerts: true, role: "ADMIN", userId: "x" } as never);
    expect(r).toEqual({ notifyRunAlerts: true });
  });
  it("checks the display name", () => {
    expect(displayNameSchema.safeParse("  Nilav ").data).toBe("Nilav");
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
    expect(displayNameSchema.safeParse("x".repeat(41)).success).toBe(false);
  });
  it("puts each notification type under one switch", () => {
    expect(NOTIFICATION_GROUP.run_completed).toBe("notifyRunAlerts");
    expect(NOTIFICATION_GROUP.report_comment).toBe("notifyReportUpdates");
    expect(NOTIFICATION_GROUP.moderation_assigned).toBe("notifyModeration");
    expect(NOTIFICATION_GROUP.system).toBeUndefined();
  });
});
