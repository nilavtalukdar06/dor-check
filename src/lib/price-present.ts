import type { PriceBand } from "./price";

type Tone = "danger" | "warning" | "ok" | "info";
type Basis = "curated" | "researched" | "estimated" | null;

type Copy = { title: string; badge: string; tone: Tone };

const CURATED: Record<PriceBand, Copy> = {
  WELL_ABOVE_RANGE: { title: "Well above range", badge: "Overpriced", tone: "danger" },
  ABOVE_RANGE: { title: "Above range", badge: "Pricey", tone: "warning" },
  WITHIN_RANGE: { title: "Within range", badge: "Fair price", tone: "ok" },
  BELOW_RANGE: { title: "Below range", badge: "Unusually low", tone: "info" },
  NO_REFERENCE: { title: "No reference", badge: "No tariff", tone: "info" },
};

/** Researched ranges are softer: they come from published prices, not an official sheet. */
const RESEARCHED: Partial<Record<PriceBand, Copy>> = {
  WELL_ABOVE_RANGE: { title: "Well above range", badge: "Likely overpriced", tone: "danger" },
};

/** Estimates never call a price overpriced: they only suggest checking again. */
const ESTIMATED: Record<Exclude<PriceBand, "NO_REFERENCE">, Copy> = {
  WELL_ABOVE_RANGE: { title: "Well above estimate", badge: "Check again", tone: "warning" },
  ABOVE_RANGE: { title: "Above estimate", badge: "Check again", tone: "warning" },
  WITHIN_RANGE: { title: "Within estimate", badge: "Looks fair", tone: "ok" },
  BELOW_RANGE: { title: "Below estimate", badge: "Unusually low", tone: "info" },
};

export function bandCopy(band: PriceBand, basis: Basis): Copy {
  if (band !== "NO_REFERENCE" && basis === "estimated") return ESTIMATED[band];
  if (basis === "researched") return RESEARCHED[band] ?? CURATED[band];
  return CURATED[band];
}

/** Kept for callers that only know the band. */
export const BAND_COPY = CURATED;

export function bandSubtitle(band: PriceBand, percentOverHigh: number, basis: Basis = "curated") {
  const end = basis === "estimated" ? "the high end of the estimate" : "the high end";
  switch (band) {
    case "WELL_ABOVE_RANGE":
    case "ABOVE_RANGE":
      return `Quote is about ${Math.round(percentOverHigh)} percent over ${end}`;
    case "WITHIN_RANGE":
      return basis === "estimated" ? "Quote sits inside the estimated range" : "Quote sits inside the usual range";
    case "BELOW_RANGE":
      return "Quote is lower than usual. Check what is included before you pay";
    default:
      return "There is nothing to compare this quote with yet";
  }
}

export const BASIS_LABEL: Record<Exclude<Basis, null>, (n: number | null) => string> = {
  curated: () => "Curated tariff · High confidence",
  researched: (n) => `Researched from ${n ?? "several"} published prices · Medium confidence`,
  estimated: () => "Estimate from distance · Low confidence",
};
