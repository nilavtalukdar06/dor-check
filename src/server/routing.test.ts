import { describe, expect, it } from "vitest";
import { estimateRoute, haversineKm, parseDirections, thin } from "./routing";

describe("parseDirections", () => {
  it("reads distance, duration and [lat, lng] geometry from a Mapbox response", () => {
    const r = parseDirections({
      routes: [{ distance: 157092.8, duration: 12503, geometry: { coordinates: [[92.79263, 26.65281], [92.42401, 27.26445]] } }],
    });
    expect(r).toEqual({ distanceKm: 157, durationMin: 208, geometry: [[26.65281, 92.79263], [27.26445, 92.42401]], approx: false });
  });
  it("returns null when there is no route", () => {
    expect(parseDirections({ routes: [] })).toBeNull();
    expect(parseDirections({})).toBeNull();
  });
});

describe("estimateRoute and helpers", () => {
  const guwahati = { lat: 26.1061, lng: 91.5859 };
  const shillong = { lat: 25.5776, lng: 91.8832 };
  it("haversine is about 66 km between Guwahati airport and Shillong", () => {
    expect(Math.round(haversineKm(guwahati, shillong))).toBe(66);
  });
  it("straight-line estimate is marked approx with no geometry", () => {
    expect(estimateRoute(guwahati, shillong)).toMatchObject({ distanceKm: 86, approx: true, geometry: null });
  });
  it("thin keeps the ends and caps the count", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => [i, i] as [number, number]);
    const t = thin(pts, 250);
    expect(t).toHaveLength(250);
    expect(t[0]).toEqual([0, 0]);
    expect(t[249]).toEqual([999, 999]);
  });
});
