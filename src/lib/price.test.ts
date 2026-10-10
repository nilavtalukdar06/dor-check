import { describe, expect, it } from "vitest";
import { checkPrice, classifyQuote, findBenchmark, type Benchmark } from "./price";
import { routeKey } from "./route-key";

const on = new Date("2026-10-10T00:00:00Z");
const effective = new Date("2026-10-07T00:00:00Z");

const taxi = (
  id: string,
  origin: string,
  destination: string,
  vehicle: string,
  lowInr: number,
  highInr: number,
  extra: Partial<Benchmark> = {},
): Benchmark => ({
  id,
  serviceType: "TAXI",
  routeKey: routeKey(origin, destination, vehicle),
  originNames: [origin],
  destinationNames: [destination],
  vehicle,
  unit: "PER_TRIP",
  lowInr,
  highInr,
  effectiveOn: effective,
  ...extra,
});

const benchmarks: Benchmark[] = [
  taxi("air-shillong-sedan", "Guwahati airport", "Shillong, Police Bazar", "SEDAN", 2200, 3000),
  { ...taxi("air-shillong-suv", "Guwahati airport", "Shillong, Police Bazar", "SUV", 3200, 4200) },
  taxi("rly-shillong-sedan", "Guwahati railway station", "Shillong, Police Bazar", "SEDAN", 2200, 3000, {
    originNames: ["Guwahati railway station", "Paltan Bazar"],
  }),
  taxi("air-rly-sedan", "Guwahati airport", "Guwahati railway station", "SEDAN", 500, 800),
  {
    id: "ekh-standard",
    serviceType: "STAY",
    routeKey: routeKey("East Khasi Hills", "Standard room"),
    districtNames: ["East Khasi Hills", "Shillong"],
    qualifier: "Standard room",
    unit: "PER_NIGHT",
    lowInr: 2200,
    highInr: 3400,
    effectiveOn: effective,
  },
  {
    id: "ekh-budget",
    serviceType: "STAY",
    routeKey: routeKey("East Khasi Hills", "Budget homestay"),
    districtNames: ["East Khasi Hills", "Shillong"],
    qualifier: "Budget homestay",
    unit: "PER_NIGHT",
    lowInr: 1200,
    highInr: 2200,
    effectiveOn: effective,
  },
  {
    id: "majuli-homestay",
    serviceType: "STAY",
    routeKey: routeKey("Majuli", "Homestay"),
    districtNames: ["Majuli"],
    qualifier: "Homestay",
    unit: "PER_NIGHT",
    lowInr: 1000,
    highInr: 1800,
    effectiveOn: effective,
  },
];

describe("classifyQuote bands", () => {
  const low = 2200;
  const high = 3000;
  it("below the range", () => expect(classifyQuote(1500, low, high).band).toBe("BELOW_RANGE"));
  it("within the range", () => expect(classifyQuote(2600, low, high).band).toBe("WITHIN_RANGE"));
  it("above the range", () => expect(classifyQuote(3500, low, high).band).toBe("ABOVE_RANGE"));
  it("well above the range", () => expect(classifyQuote(4800, low, high).band).toBe("WELL_ABOVE_RANGE"));

  it("boundary: exactly the low end is within", () => {
    expect(classifyQuote(2200, low, high).band).toBe("WITHIN_RANGE");
    expect(classifyQuote(2199, low, high).band).toBe("BELOW_RANGE");
  });
  it("boundary: exactly the high end is within, one rupee more is above", () => {
    expect(classifyQuote(3000, low, high).band).toBe("WITHIN_RANGE");
    expect(classifyQuote(3001, low, high).band).toBe("ABOVE_RANGE");
  });
  it("boundary: exactly 1.25 x high is above, one rupee more is well above", () => {
    expect(classifyQuote(3750, low, high).band).toBe("ABOVE_RANGE");
    expect(classifyQuote(3751, low, high).band).toBe("WELL_ABOVE_RANGE");
  });
  it("boundary is exact for awkward highs (no float drift)", () => {
    expect(classifyQuote(1250, 800, 1000).band).toBe("ABOVE_RANGE");
    expect(classifyQuote(1251, 800, 1000).band).toBe("WELL_ABOVE_RANGE");
  });

  it("percentOverHigh: Rs 4,800 vs 3,000 is 60 percent", () => {
    expect(classifyQuote(4800, low, high).percentOverHigh).toBe(60);
  });
  it("percentOverHigh is 0 when not above the range", () => {
    expect(classifyQuote(2600, low, high).percentOverHigh).toBe(0);
    expect(classifyQuote(1000, low, high).percentOverHigh).toBe(0);
  });
  it("percentOverHigh rounds to one decimal", () => {
    expect(classifyQuote(3100, low, high).percentOverHigh).toBe(3.3);
  });

  it("rejects bad input", () => {
    expect(() => classifyQuote(0, low, high)).toThrow(RangeError);
    expect(() => classifyQuote(-5, low, high)).toThrow(RangeError);
    expect(() => classifyQuote(Number.NaN, low, high)).toThrow(RangeError);
    expect(() => classifyQuote(100, 500, 100)).toThrow(RangeError);
  });
});

describe("findBenchmark: taxi", () => {
  const base = { service: "TAXI" as const, quotedInr: 4800, asOf: on };

  it("exact route key match", () => {
    const r = findBenchmark({ ...base, origin: "Guwahati airport", destination: "Shillong, Police Bazar", vehicle: "Sedan" }, benchmarks);
    expect(r.match).toBe("exact");
    expect(r.benchmark?.id).toBe("air-shillong-sedan");
  });
  it("picks the vehicle asked for", () => {
    const r = findBenchmark({ ...base, origin: "Guwahati airport", destination: "Shillong, Police Bazar", vehicle: "SUV" }, benchmarks);
    expect(r.benchmark?.id).toBe("air-shillong-suv");
  });
  it("fuzzy: destination 'Shillong' matches 'Shillong, Police Bazar'", () => {
    const r = findBenchmark({ ...base, origin: "Guwahati airport", destination: "Shillong", vehicle: "Sedan" }, benchmarks);
    expect(r.match).toBe("fuzzy");
    expect(r.benchmark?.id).toBe("air-shillong-sedan");
  });
  it("fuzzy: matches an alias", () => {
    const r = findBenchmark({ ...base, origin: "Paltan Bazar", destination: "Shillong", vehicle: "Sedan" }, benchmarks);
    expect(r.benchmark?.id).toBe("rly-shillong-sedan");
  });
  it("does not confuse airport with railway station", () => {
    const r = findBenchmark({ ...base, origin: "Guwahati airport", destination: "Guwahati railway station", vehicle: "Sedan" }, benchmarks);
    expect(r.benchmark?.id).toBe("air-rly-sedan");
  });
  it("missing route returns no reference", () => {
    const r = findBenchmark({ ...base, origin: "Jorhat airport", destination: "Majuli", vehicle: "Sedan" }, benchmarks);
    expect(r).toEqual({ benchmark: null, match: "none", reason: "no_benchmark" });
  });
  it("no reference when the vehicle has no tariff", () => {
    const r = findBenchmark({ ...base, origin: "Guwahati airport", destination: "Shillong", vehicle: "Bike" }, benchmarks);
    expect(r.benchmark).toBeNull();
  });
  it("origin or destination missing returns no reference", () => {
    expect(findBenchmark({ ...base, origin: "Guwahati airport" }, benchmarks).benchmark).toBeNull();
  });
  it("an expired tariff is reported as outdated", () => {
    const old = benchmarks.map((b) => (b.id === "air-shillong-sedan" ? { ...b, expiresOn: new Date("2026-09-01") } : b));
    const r = findBenchmark({ ...base, origin: "Guwahati airport", destination: "Shillong, Police Bazar", vehicle: "Sedan" }, old);
    expect(r).toEqual({ benchmark: null, match: "none", reason: "outdated" });
  });
  it("a tariff that has not started yet is not used", () => {
    const future = benchmarks.map((b) => (b.id === "air-shillong-sedan" ? { ...b, effectiveOn: new Date("2027-01-01") } : b));
    const r = findBenchmark({ ...base, origin: "Guwahati airport", destination: "Shillong, Police Bazar", vehicle: "Sedan" }, future);
    expect(r.benchmark).toBeNull();
  });
  it("inactive tariffs are ignored", () => {
    const off = benchmarks.map((b) => (b.id === "air-shillong-sedan" ? { ...b, isActive: false } : b));
    expect(findBenchmark({ ...base, origin: "Guwahati airport", destination: "Shillong, Police Bazar", vehicle: "Sedan" }, off).benchmark).toBeNull();
  });
  it("the newest tariff wins when a route has several", () => {
    const newer = taxi("air-shillong-sedan-v2", "Guwahati airport", "Shillong, Police Bazar", "SEDAN", 2400, 3200, {
      effectiveOn: new Date("2026-10-09T00:00:00Z"),
    });
    const r = findBenchmark({ ...base, origin: "Guwahati airport", destination: "Shillong, Police Bazar", vehicle: "Sedan" }, [...benchmarks, newer]);
    expect(r.benchmark?.id).toBe("air-shillong-sedan-v2");
  });
  it("refuses to guess when two different routes tie", () => {
    const r = findBenchmark({ ...base, origin: "Guwahati", destination: "Shillong, Police Bazar", vehicle: "Sedan" }, [
      taxi("a", "Guwahati airport", "Shillong, Police Bazar", "SEDAN", 1, 2),
      taxi("b", "Guwahati station", "Shillong, Police Bazar", "SEDAN", 1, 2),
    ]);
    expect(r).toEqual({ benchmark: null, match: "none", reason: "ambiguous" });
  });
});

describe("findBenchmark: stays, guides, tours", () => {
  const stay = { service: "STAY" as const, quotedInr: 900, asOf: on };

  it("district and qualifier exact", () => {
    const r = findBenchmark({ ...stay, district: "East Khasi Hills", qualifier: "Standard room" }, benchmarks);
    expect(r.benchmark?.id).toBe("ekh-standard");
    expect(r.match).toBe("exact");
  });
  it("qualifier fuzzy ('standard')", () => {
    const r = findBenchmark({ ...stay, district: "East Khasi Hills", qualifier: "standard" }, benchmarks);
    expect(r.benchmark?.id).toBe("ekh-standard");
  });
  it("district alias ('Shillong')", () => {
    const r = findBenchmark({ ...stay, district: "Shillong", qualifier: "Standard room" }, benchmarks);
    expect(r.benchmark?.id).toBe("ekh-standard");
  });
  it("one tariff in the district needs no qualifier", () => {
    expect(findBenchmark({ ...stay, district: "Majuli" }, benchmarks).benchmark?.id).toBe("majuli-homestay");
  });
  it("several tariffs and no qualifier is ambiguous", () => {
    expect(findBenchmark({ ...stay, district: "East Khasi Hills" }, benchmarks)).toEqual({
      benchmark: null,
      match: "none",
      reason: "ambiguous",
    });
  });
  it("unknown district has no reference", () => {
    expect(findBenchmark({ ...stay, district: "Dibrugarh" }, benchmarks).benchmark).toBeNull();
  });
  it("other service types are not mixed in", () => {
    expect(findBenchmark({ service: "GUIDE", quotedInr: 900, district: "Majuli", asOf: on }, benchmarks).benchmark).toBeNull();
  });
});

describe("checkPrice end to end", () => {
  it("the headline case: Rs 4,800 airport taxi is well above range", () => {
    const r = checkPrice(
      { service: "TAXI", quotedInr: 4800, origin: "Guwahati airport", destination: "Shillong, Police Bazar", vehicle: "Sedan", asOf: on },
      benchmarks,
    );
    expect(r).toMatchObject({
      band: "WELL_ABOVE_RANGE",
      lowInr: 2200,
      highInr: 3000,
      percentOverHigh: 60,
      benchmarkId: "air-shillong-sedan",
      match: "exact",
      unit: "PER_TRIP",
    });
    expect(r.effectiveOn).toEqual(effective);
  });
  it("a stay at Rs 900 is below the usual range", () => {
    const r = checkPrice({ service: "STAY", quotedInr: 900, district: "East Khasi Hills", qualifier: "Standard room", asOf: on }, benchmarks);
    expect(r.band).toBe("BELOW_RANGE");
    expect(r.unit).toBe("PER_NIGHT");
  });
  it("no reference carries no numbers", () => {
    const r = checkPrice({ service: "TAXI", quotedInr: 1200, origin: "Jorhat airport", destination: "Majuli", vehicle: "Sedan", asOf: on }, benchmarks);
    expect(r).toMatchObject({
      band: "NO_REFERENCE",
      lowInr: null,
      highInr: null,
      benchmarkId: null,
      effectiveOn: null,
      match: "none",
      reason: "no_benchmark",
    });
  });
});
