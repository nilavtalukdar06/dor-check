import { roundFare } from "./price";

// Pure helpers for turning prices found on web pages into a range we can stand behind.
// The model only proposes prices; these checks decide what is kept.

export type PriceUnit = "PER_TRIP" | "PER_KM" | "PER_NIGHT" | "PER_DAY" | "PER_PERSON";

export type Observation = {
  amountInr: number;
  unit: PriceUnit;
  url: string;
  domain: string;
  title: string;
  /** Verbatim sentence from the page. */
  quote: string;
  description?: string;
};

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The quote must really be on the page and must contain the amount. Stops a model from
 * inventing a price or attaching it to the wrong sentence.
 */
export function verifyQuote(pageText: string, quote: string, amountInr: number) {
  const q = squash(quote);
  if (q.length < 8) return false;
  if (!squash(pageText).includes(q)) return false;
  const digits = quote.replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? [];
  return digits.some((d) => Math.round(Number(d)) === Math.round(amountInr));
}

/** Bring a price to the unit we compare in. Per-km rates become a trip price via the route. */
export function normaliseUnit(
  obs: Observation,
  want: Exclude<PriceUnit, "PER_KM">,
  distanceKm: number | null,
): Observation | null {
  if (obs.unit === want) return obs;
  if (obs.unit === "PER_KM" && want === "PER_TRIP" && distanceKm && distanceKm > 0) {
    return { ...obs, amountInr: Math.round(obs.amountInr * distanceKm), unit: "PER_TRIP" };
  }
  return null;
}

function percentile(sorted: number[], p: number) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export type Aggregate =
  | { ok: true; lowInr: number; highInr: number; medianInr: number; kept: Observation[]; dropped: Observation[] }
  | { ok: false; reason: "too_few_sources" | "too_few_domains"; kept: Observation[]; dropped: Observation[] };

/**
 * Combine observations into a range: drop outliers (median absolute deviation), then require
 * at least `minSources` prices from at least `minDomains` different sites. The range is the
 * 25th to 75th percentile, never narrower than ±10 percent of the median.
 */
export function aggregate(
  observations: Observation[],
  { minSources = 3, minDomains = 3 }: { minSources?: number; minDomains?: number } = {},
): Aggregate {
  // One price per page and amount, so a page repeating itself does not count twice.
  const seen = new Set<string>();
  const unique = observations.filter((o) => {
    const k = `${o.url}|${o.amountInr}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return o.amountInr > 0;
  });
  if (unique.length === 0) return { ok: false, reason: "too_few_sources", kept: [], dropped: [] };

  const amounts = unique.map((o) => o.amountInr).sort((a, b) => a - b);
  const med = percentile(amounts, 0.5);
  const mad = percentile(
    amounts.map((a) => Math.abs(a - med)).sort((a, b) => a - b),
    0.5,
  );
  const limit = mad > 0 ? 3 * 1.4826 * mad : med * 0.5;
  const kept = unique.filter((o) => Math.abs(o.amountInr - med) <= limit);
  const dropped = unique.filter((o) => !kept.includes(o));

  if (kept.length < minSources) return { ok: false, reason: "too_few_sources", kept, dropped };
  if (new Set(kept.map((o) => o.domain)).size < minDomains) {
    return { ok: false, reason: "too_few_domains", kept, dropped };
  }

  const sorted = kept.map((o) => o.amountInr).sort((a, b) => a - b);
  const keptMedian = percentile(sorted, 0.5);
  const lowInr = roundFare(Math.min(percentile(sorted, 0.25), keptMedian * 0.9));
  const highInr = roundFare(Math.max(percentile(sorted, 0.75), keptMedian * 1.1));
  return { ok: true, lowInr, highInr, medianInr: Math.round(keptMedian), kept, dropped };
}

/** "https://www.Example.com/x" -> "example.com". */
export function domainOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Sane bounds for Indian taxi fares, in rupees per km. Catches local-trip prices and typos. */
const TAXI_PER_KM = { min: 6, max: 80 };

/**
 * Drop prices that cannot be right for this request, before they reach the range.
 * Taxi trip prices must work out between Rs 6 and Rs 80 per km of the routed distance.
 */
export function isPlausible(obs: Observation, service: string, distanceKm: number | null) {
  if (obs.amountInr <= 0) return false;
  if (service === "TAXI" && obs.unit === "PER_KM") {
    return obs.amountInr >= TAXI_PER_KM.min && obs.amountInr <= TAXI_PER_KM.max;
  }
  if (service === "TAXI" && obs.unit === "PER_TRIP" && distanceKm && distanceKm > 0) {
    const perKm = obs.amountInr / distanceKm;
    return perKm >= TAXI_PER_KM.min && perKm <= TAXI_PER_KM.max;
  }
  return true;
}
