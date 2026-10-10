import { describe, expect, it } from "vitest";
import { directoryHref, directoryParamsSchema, serviceTypeFor } from "./directory";

const parse = (o: Record<string, string | string[] | undefined>) => directoryParamsSchema.parse(o);

describe("directoryParamsSchema", () => {
  it("defaults to everything", () => {
    expect(parse({})).toEqual({ type: "all", q: undefined, verified: undefined, property: undefined });
  });
  it("reads a tab, search, verified and drawer", () => {
    expect(parse({ type: "stays", q: " kaziranga ", verified: "1", property: "sampleridge-stay" })).toEqual({
      type: "stays",
      q: "kaziranga",
      verified: "1",
      property: "sampleridge-stay",
    });
  });
  it("falls back instead of failing on junk", () => {
    expect(parse({ type: "hotels", verified: "yes" })).toMatchObject({ type: "all", verified: undefined });
    expect(parse({ q: "x".repeat(200) }).q).toBeUndefined();
  });
  it("uses the first value when a param repeats", () => {
    expect(parse({ type: ["taxis", "tours"] }).type).toBe("taxis");
  });
  it("treats a blank search as none", () => {
    expect(parse({ q: "   " }).q).toBeUndefined();
  });
});

describe("serviceTypeFor and directoryHref", () => {
  it("maps tabs to service types", () => {
    expect(serviceTypeFor("all")).toBeUndefined();
    expect(serviceTypeFor("stays")).toBe("STAY");
    expect(serviceTypeFor("taxis")).toBe("TAXI");
    expect(serviceTypeFor("guides")).toBe("GUIDE");
    expect(serviceTypeFor("tours")).toBe("TOUR");
  });
  it("leaves defaults out of the URL", () => {
    expect(directoryHref({})).toBe("/directory");
    expect(directoryHref({ type: "all" })).toBe("/directory");
  });
  it("round-trips filters", () => {
    const href = directoryHref({ type: "guides", q: "Cherra punji", verified: "1", property: "x" });
    expect(href).toBe("/directory?type=guides&q=Cherra+punji&verified=1&property=x");
    const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parse(sp)).toMatchObject({ type: "guides", q: "Cherra punji", verified: "1", property: "x" });
  });
});
