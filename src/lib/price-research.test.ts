import { describe, expect, it } from "vitest";
import { aggregate, domainOf, isPlausible, normaliseUnit, verifyQuote, type Observation } from "./price-research";

const page = `## Shillong to Guwahati Airport
Our **sedan** fare is ₹2,600 per trip, tolls included.
SUV costs Rs 3,400. Per km rate: ₹16/km.`;

describe("verifyQuote", () => {
  it("accepts a quote that is on the page and holds the amount", () => {
    expect(verifyQuote(page, "Our sedan fare is ₹2,600 per trip", 2600)).toBe(true);
  });
  it("ignores markdown emphasis and spacing differences", () => {
    expect(verifyQuote(page, "our   SEDAN fare is ₹2,600", 2600)).toBe(true);
  });
  it("rejects a made-up quote", () => {
    expect(verifyQuote(page, "Our sedan fare is ₹1,200 per trip", 1200)).toBe(false);
  });
  it("rejects a real quote attached to the wrong amount", () => {
    expect(verifyQuote(page, "SUV costs Rs 3,400", 2600)).toBe(false);
  });
  it("rejects quotes too short to mean anything", () => {
    expect(verifyQuote(page, "₹16", 16)).toBe(false);
  });
});

const obs = (amountInr: number, domain: string, unit: Observation["unit"] = "PER_TRIP"): Observation => ({
  amountInr,
  unit,
  url: `https://${domain}/page`,
  domain,
  title: domain,
  quote: `fare ${amountInr}`,
});

describe("normaliseUnit", () => {
  it("turns a per-km rate into a trip price", () => {
    expect(normaliseUnit(obs(16, "a.com", "PER_KM"), "PER_TRIP", 100)?.amountInr).toBe(1600);
  });
  it("keeps matching units and drops the rest", () => {
    expect(normaliseUnit(obs(2600, "a.com"), "PER_TRIP", null)?.amountInr).toBe(2600);
    expect(normaliseUnit(obs(2600, "a.com", "PER_NIGHT"), "PER_TRIP", 100)).toBeNull();
    expect(normaliseUnit(obs(16, "a.com", "PER_KM"), "PER_TRIP", null)).toBeNull();
  });
});

describe("aggregate", () => {
  it("builds a range from agreeing sources on different sites", () => {
    const r = aggregate([obs(2400, "a.com"), obs(2600, "b.com"), obs(2800, "c.com"), obs(3000, "d.com")]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.medianInr).toBe(2700);
      expect(r.lowInr).toBe(2450); // min(p25 2550, 0.9 x 2700 = 2430), rounded to Rs 50
      expect(r.highInr).toBe(2950); // max(p75 2850, 1.1 x 2700 = 2970), rounded
    }
  });
  it("drops an outlier", () => {
    const r = aggregate([obs(2400, "a.com"), obs(2600, "b.com"), obs(2700, "c.com"), obs(25000, "d.com")]);
    expect(r.ok).toBe(true);
    expect(r.dropped.map((o) => o.amountInr)).toEqual([25000]);
  });
  it("needs three sources", () => {
    expect(aggregate([obs(2400, "a.com"), obs(2600, "b.com")])).toMatchObject({ ok: false, reason: "too_few_sources" });
  });
  it("needs three different sites", () => {
    expect(aggregate([obs(2400, "a.com"), obs(2600, "a.com"), obs(2700, "b.com")])).toMatchObject({
      ok: false,
      reason: "too_few_domains",
    });
  });
  it("counts the same price on the same page once", () => {
    const r = aggregate([obs(2400, "a.com"), obs(2400, "a.com"), obs(2600, "b.com")]);
    expect(r).toMatchObject({ ok: false, reason: "too_few_sources" });
  });
  it("never makes a range narrower than ±10% of the median", () => {
    const r = aggregate([obs(3000, "a.com"), obs(3000, "b.com"), obs(3000, "c.com")]);
    expect(r).toMatchObject({ ok: true, lowInr: 2700, highInr: 3300 });
  });
});

describe("domainOf", () => {
  it("strips www and lower-cases", () => expect(domainOf("https://WWW.Uber.com/in/x")).toBe("uber.com"));
  it("is empty for junk", () => expect(domainOf("not a url")).toBe(""));
});

describe("isPlausible", () => {
  it("accepts a sane per-km taxi rate and rejects silly ones", () => {
    expect(isPlausible(obs(14, "a.com", "PER_KM"), "TAXI", 150)).toBe(true);
    expect(isPlausible(obs(2, "a.com", "PER_KM"), "TAXI", 150)).toBe(false);
    expect(isPlausible(obs(250, "a.com", "PER_KM"), "TAXI", 150)).toBe(false);
  });
  it("rejects a local-trip price used for a long route", () => {
    expect(isPlausible(obs(500, "a.com"), "TAXI", 157)).toBe(false); // Rs 3/km
    expect(isPlausible(obs(3800, "a.com"), "TAXI", 157)).toBe(true); // Rs 24/km
  });
  it("leaves other services alone", () => {
    expect(isPlausible(obs(900, "a.com", "PER_NIGHT"), "STAY", null)).toBe(true);
  });
});
