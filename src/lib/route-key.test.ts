import { describe, expect, it } from "vitest";
import { normalizeText, routeKey } from "./route-key";

describe("normalizeText", () => {
  it("lower-cases and strips punctuation", () => {
    expect(normalizeText("Shillong, Police Bazar")).toBe("shillong-police-bazar");
  });
  it("strips accents and surrounding separators", () => {
    expect(normalizeText("  Café -- Déjà vu! ")).toBe("cafe-deja-vu");
  });
  it("returns an empty string for punctuation only", () => {
    expect(normalizeText("?!")).toBe("");
  });
});

describe("routeKey", () => {
  it("joins normalised parts with a pipe", () => {
    expect(routeKey("Guwahati airport", "Shillong, Police Bazar", "Sedan")).toBe(
      "guwahati-airport|shillong-police-bazar|sedan",
    );
  });
  it("treats missing parts as empty", () => {
    expect(routeKey("East Khasi Hills", undefined)).toBe("east-khasi-hills|");
  });
});
