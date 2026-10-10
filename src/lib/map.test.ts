import { describe, expect, it } from "vitest";
import { distanceKm, mapQuerySchema, shortDate, sortByDistance } from "./map";

const parse = (o: Record<string, string>) => mapQuerySchema.safeParse(o);

describe("mapQuerySchema", () => {
  it("reads a bounding box", () => {
    const r = parse({ bbox: "90,24,96,28" });
    expect(r.success && r.data.bbox).toEqual([90, 24, 96, 28]);
  });
  it("rejects a bad box", () => {
    expect(parse({ bbox: "90,24,96" }).success).toBe(false);
    expect(parse({ bbox: "96,24,90,28" }).success).toBe(false); // west must be left of east
    expect(parse({ bbox: "a,b,c,d" }).success).toBe(false);
    expect(parse({ bbox: "0,0,200,10" }).success).toBe(false);
  });
  it("defaults to all layers and ignores unknown ones", () => {
    expect(parse({}).success && parse({}).data?.layers).toEqual(["reports", "properties", "tariffs"]);
    const r = parse({ layers: "reports,nonsense" });
    expect(r.success && r.data.layers).toEqual(["reports"]);
    const none = parse({ layers: "nonsense" });
    expect(none.success && none.data.layers).toHaveLength(3);
  });
  it("accepts only Assam or Meghalaya as a state", () => {
    expect(parse({ state: "AS" }).success).toBe(true);
    expect(parse({ state: "XX" }).success).toBe(false);
  });
  it("limits days and trims the search text", () => {
    expect(parse({ days: "30" }).success).toBe(true);
    expect(parse({ days: "0" }).success).toBe(false);
    expect(parse({ days: "999" }).success).toBe(false);
    const r = parse({ q: "  shillong  " });
    expect(r.success && r.data.q).toBe("shillong");
    expect(parse({ q: "x".repeat(61) }).success).toBe(false);
  });
});

describe("distance helpers", () => {
  const shillong = { lat: 25.5788, lng: 91.8933 };
  const guwahati = { lat: 26.1445, lng: 91.7362 };
  const tura = { lat: 25.5142, lng: 90.2024 };
  it("distanceKm is about 65 km Shillong to Guwahati", () => {
    expect(Math.round(distanceKm(shillong, guwahati))).toBe(65);
  });
  it("sortByDistance puts the nearest first and keeps the input intact", () => {
    const input = [{ n: "tura", ...tura }, { n: "guwahati", ...guwahati }, { n: "shillong", ...shillong }];
    const sorted = sortByDistance(input, shillong);
    expect(sorted.map((x) => x.n)).toEqual(["shillong", "guwahati", "tura"]);
    expect(input[0].n).toBe("tura");
  });
});

describe("shortDate", () => {
  it("formats in India time", () => {
    expect(shortDate("2026-10-08T19:12:00+05:30")).toBe("8 Oct");
    expect(shortDate("2026-10-08T20:00:00Z")).toBe("9 Oct"); // already the 9th in India
  });
});
