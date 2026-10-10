import type { PriceBand } from "./price";

type Tone = "danger" | "warning" | "ok" | "info";

export const BAND_COPY: Record<PriceBand, { title: string; badge: string; tone: Tone }> = {
  WELL_ABOVE_RANGE: { title: "Well above range", badge: "Overpriced", tone: "danger" },
  ABOVE_RANGE: { title: "Above range", badge: "Pricey", tone: "warning" },
  WITHIN_RANGE: { title: "Within range", badge: "Fair price", tone: "ok" },
  BELOW_RANGE: { title: "Below range", badge: "Unusually low", tone: "info" },
  NO_REFERENCE: { title: "No reference", badge: "No tariff", tone: "info" },
};

export function bandSubtitle(band: PriceBand, percentOverHigh: number) {
  switch (band) {
    case "WELL_ABOVE_RANGE":
    case "ABOVE_RANGE":
      return `Quote is about ${Math.round(percentOverHigh)} percent over the high end`;
    case "WITHIN_RANGE":
      return "Quote sits inside the usual range";
    case "BELOW_RANGE":
      return "Quote is lower than usual. Check what is included before you pay";
    default:
      return "There is nothing to compare this quote with yet";
  }
}
