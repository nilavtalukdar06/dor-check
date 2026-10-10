import { describe, expect, it } from "vitest";
import { extractIdentifiers } from "./identifiers";
import { capturableUrl, compactSources, normalizeInput, describeRequest, describeSources, INVESTIGATION_STEPS, investigationTitle, maskPhone, maskUpi, usagePeriodStart } from "./investigation";

describe("steps", () => {
  it("are the six from the plan, in order, with unique keys", () => {
    expect(INVESTIGATION_STEPS.map((s) => s[0])).toEqual(["parse-input", "search-sources", "capture-page", "retrieve-benchmarks", "analyse", "finalise"]);
  });
});

describe("investigationTitle", () => {
  it("uses the site for a link, with or without a scheme or www", () => {
    expect(investigationTitle("LINK", "https://www.Demohills-Booking.example/book?x=1")).toBe("demohills-booking.example");
    expect(investigationTitle("LINK", "shillonghills-homestay.example/rooms")).toBe("shillonghills-homestay.example");
  });
  it("uses the name, trims a long message, and never shows a phone or UPI id", () => {
    expect(investigationTitle("BUSINESS_NAME", "  Hotel   Kaziranga Retreat ")).toBe("Hotel Kaziranga Retreat");
    expect(investigationTitle("MESSAGE", "x".repeat(100))).toHaveLength(58);
    expect(investigationTitle("CONTACT", "9876543210")).toBe("Phone or UPI check");
  });
});

describe("usagePeriodStart", () => {
  it("is the first of the month in Indian time", () => {
    expect(usagePeriodStart(new Date("2026-10-10T08:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    // 19:00 UTC on 30 Sep is already 1 Oct in India
    expect(usagePeriodStart(new Date("2026-09-30T19:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(usagePeriodStart(new Date("2026-09-30T18:00:00Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("descriptions", () => {
  it("names what was found in the request", () => {
    expect(describeRequest(extractIdentifiers("https://a-b.example/x and pay ravi@okaxis, call 98765 43210"), "MESSAGE")).toBe("Found 1 link, 1 phone number, 1 UPI id");
    expect(describeRequest(extractIdentifiers("Hotel Kaziranga"), "BUSINESS_NAME")).toBe("A business name to look up");
    expect(describeRequest(extractIdentifiers("Is this fair?"), "MESSAGE")).toBe("A message to read");
  });
  it("counts sources by kind, ignoring the message and unreadable pages", () => {
    expect(describeSources([{ kind: "USER", unavailable: false }, { kind: "REPORT", unavailable: false }, { kind: "REPORT", unavailable: false }, { kind: "DIRECTORY", unavailable: false }, { kind: "WEB_PAGE", unavailable: true }])).toBe("3 sources: 2 community reports, 1 directory entry");
    expect(describeSources([{ kind: "USER", unavailable: false }])).toBe("No sources found yet");
  });
  it("picks the first link that is safe to open", () => {
    expect(capturableUrl(extractIdentifiers("http://192.168.1.1/x then https://seller.example/pay"))).toBe("https://seller.example/pay");
    expect(capturableUrl(extractIdentifiers("no link here"))).toBeNull();
  });
});

describe("masking", () => {
  it("keeps enough to recognise", () => {
    expect(maskPhone("9876543210")).toBe("98••••••10");
    expect(maskUpi("ravi.k@okaxis")).toBe("ra•••@okaxis");
  });
});

describe("compactSources", () => {
  const src = (kind: string, title: string, unavailable = false) => ({ kind, title, label: null, url: null, unavailable });
  it("leaves out the message and unreadable pages and caps the list", () => {
    const list = compactSources([src("USER", "What you sent"), src("REPORT", "r1"), src("WEB_PAGE", "gone", true), ...Array.from({ length: 20 }, (_, i) => src("TARIFF", `t${i}`))], 5);
    expect(list).toHaveLength(5);
    expect(list.map((x) => x.title)).toEqual(["r1", "t0", "t1", "t2", "t3"]);
  });
  it("shortens long titles", () => {
    expect(compactSources([src("REPORT", "x".repeat(300))])[0].title).toHaveLength(120);
  });
});

describe("normalizeInput", () => {
  it("gives a pasted link without a scheme one, so it can be opened and captured", () => {
    expect(normalizeInput("LINK", " www.makemytrip.com/hotels/hotel-details/?hotelId=1 ")).toBe("https://www.makemytrip.com/hotels/hotel-details/?hotelId=1");
    expect(normalizeInput("LINK", "http://seller.example/x")).toBe("http://seller.example/x");
    expect(capturableUrl(extractIdentifiers(normalizeInput("LINK", "www.makemytrip.com/hotels/x")))).toBe("https://www.makemytrip.com/hotels/x");
  });
  it("leaves other kinds of input alone", () => {
    expect(normalizeInput("MESSAGE", "  hello there ")).toBe("hello there");
    expect(normalizeInput("BUSINESS_NAME", "Hotel X")).toBe("Hotel X");
  });
});
