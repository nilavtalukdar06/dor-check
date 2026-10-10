import { describe, expect, it } from "vitest";
import { formatDate, formatDuration, rs } from "./format";
import { parseRupees, priceCheckSchema } from "./price-schema";

describe("parseRupees", () => {
  it.each([
    ["4800", 4800],
    ["Rs 4,800", 4800],
    ["rs. 4,800", 4800],
    ["₹ 2 200", 2200],
    ["4800.0", 4800],
  ])("%s -> %d", (raw, n) => expect(parseRupees(raw)).toBe(n));
  it("is NaN for blank or text", () => {
    expect(parseRupees("")).toBeNaN();
    expect(parseRupees("a lot")).toBeNaN();
  });
});

describe("priceCheckSchema", () => {
  const taxi = { service: "TAXI", quotedInr: 4800, origin: "Guwahati airport", destination: "Shillong" } as const;
  it("accepts a taxi quote with both places", () => {
    expect(priceCheckSchema.safeParse(taxi).success).toBe(true);
  });
  it("taxi needs both places", () => {
    const r = priceCheckSchema.safeParse({ service: "TAXI", quotedInr: 100 });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(["origin", "destination"]);
  });
  it("other services need a district", () => {
    expect(priceCheckSchema.safeParse({ service: "STAY", quotedInr: 900 }).success).toBe(false);
    expect(priceCheckSchema.safeParse({ service: "STAY", quotedInr: 900, districtId: "d1" }).success).toBe(true);
  });
  it.each([0, -1, 12.5, 10_000_001])("rejects quote %d", (quotedInr) => {
    expect(priceCheckSchema.safeParse({ ...taxi, quotedInr }).success).toBe(false);
  });
});

describe("format helpers", () => {
  it("rs groups Indian style", () => expect(rs(1234567)).toBe("Rs 12,34,567"));
  it("formatDuration", () => {
    expect(formatDuration(165)).toBe("2 h 45 m");
    expect(formatDuration(45)).toBe("45 m");
    expect(formatDuration(120)).toBe("2 h");
  });
  it("formatDate keeps the UTC day", () => expect(formatDate("2026-10-07T00:00:00.000Z")).toBe("7 Oct 2026"));
});
