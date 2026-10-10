import { describe, expect, it } from "vitest";
import { canTransition, generateReference, REFERENCE_ALPHABET, REFERENCE_RE, reportInputSchema, reportListParamsSchema, reportsHref, TRANSITIONS, upcomingSteps, type ReportStatusName } from "./reports";

describe("references", () => {
  it("are TTD- and six characters from an alphabet with no look-alikes", () => {
    for (let i = 0; i < 500; i++) expect(generateReference()).toMatch(REFERENCE_RE);
    expect(REFERENCE_ALPHABET).not.toMatch(/[01ILO]/);
  });
  it("use every character of the alphabet", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) for (const ch of generateReference().slice(4)) seen.add(ch);
    expect(seen.size).toBe(REFERENCE_ALPHABET.length);
  });
  it("can be driven by a fixed generator", () => {
    let n = 0;
    expect(generateReference(() => n++)).toBe("TTD-234567");
  });
});

describe("the status machine", () => {
  const all = Object.keys(TRANSITIONS) as ReportStatusName[];
  it("moves forward through review", () => {
    expect(canTransition("NEW", "UNDER_REVIEW")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "VERIFIED")).toBe(true);
    expect(canTransition("VERIFIED", "RESOLVED")).toBe(true);
    expect(canTransition("RESOLVED", "CLOSED")).toBe(true);
  });
  it("cannot skip review or go backwards", () => {
    expect(canTransition("NEW", "VERIFIED")).toBe(false);
    expect(canTransition("NEW", "RESOLVED")).toBe(false);
    expect(canTransition("RESOLVED", "UNDER_REVIEW")).toBe(false);
  });
  it("final states stay final, and nothing goes to itself or back to NEW", () => {
    expect(TRANSITIONS.CLOSED).toEqual([]);
    expect(TRANSITIONS.REJECTED).toEqual([]);
    for (const s of all) {
      expect(canTransition(s, s)).toBe(false);
      expect(canTransition(s, "NEW")).toBe(false);
    }
  });
  it("every status can still reach a final one", () => {
    const final = new Set<ReportStatusName>(["CLOSED", "REJECTED"]);
    for (const s of all) {
      if (final.has(s)) continue;
      const seen = new Set<ReportStatusName>([s]);
      const queue = [s];
      while (queue.length) for (const n of TRANSITIONS[queue.shift()!]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
      expect([...seen].some((x) => final.has(x))).toBe(true);
    }
  });
  it("shows the steps still ahead", () => {
    expect(upcomingSteps("NEW")).toEqual(["UNDER_REVIEW", "RESOLVED"]);
    expect(upcomingSteps("UNDER_REVIEW")).toEqual(["RESOLVED"]);
    expect(upcomingSteps("CLOSED")).toEqual([]);
  });
});

describe("the form schema", () => {
  const good = { kind: "SCAM", category: "STAY", summary: "Asked for an advance to a personal UPI id", description: "Shared a booking link and asked for an advance payment, then the page vanished.", districtId: "d1" } as const;
  it("accepts a minimal report and fills the defaults", () => {
    const r = reportInputSchema.parse(good);
    expect(r.isAnonymous).toBe(true);
    expect(r.evidenceIds).toEqual([]);
    expect(r.reportedUrl).toBeUndefined();
  });
  it("explains what is wrong in plain words", () => {
    const r = reportInputSchema.safeParse({ ...good, summary: "short", description: "too short", districtId: "" });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toEqual(expect.arrayContaining([expect.stringMatching(/short title/), expect.stringMatching(/sentence or two/), expect.stringMatching(/district/)]));
  });
  it("adds https:// to a web address and rejects junk", () => {
    expect(reportInputSchema.parse({ ...good, reportedUrl: "demohills-booking.example/book" }).reportedUrl).toBe("https://demohills-booking.example/book");
    expect(reportInputSchema.safeParse({ ...good, reportedUrl: "not a url" }).success).toBe(false);
  });
  it("limits the date, the amount and the number of attachments", () => {
    expect(reportInputSchema.safeParse({ ...good, incidentDate: "2999-01-01" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...good, incidentDate: "2001-01-01" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...good, incidentDate: new Date().toISOString().slice(0, 10) }).success).toBe(true);
    expect(reportInputSchema.safeParse({ ...good, amountInr: 0 }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...good, amountInr: 12.5 }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...good, evidenceIds: Array.from({ length: 9 }, (_, i) => `e${i}`) }).success).toBe(false);
  });
});

describe("the list URL", () => {
  it("falls back to defaults for anything unknown", () => {
    expect(reportListParamsSchema.parse({ tab: "nope", category: "x", status: "y", page: "-3", district: "../" })).toEqual({ tab: "all", q: undefined, category: undefined, district: undefined, status: undefined, page: 1 });
  });
  it("builds short URLs and round-trips", () => {
    expect(reportsHref({})).toBe("/reports");
    const href = reportsHref({ tab: "mine", q: "upi", category: "STAY", page: 2 });
    expect(href).toBe("/reports?tab=mine&q=upi&category=STAY&page=2");
    expect(reportListParamsSchema.parse(Object.fromEntries(new URL(href, "http://x").searchParams))).toMatchObject({ tab: "mine", q: "upi", category: "STAY", page: 2 });
  });
});
