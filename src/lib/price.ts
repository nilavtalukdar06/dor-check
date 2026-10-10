import { normalizeText, routeKey } from "./route-key";

// Pure price engine: no database, no network. Feed it benchmarks, get a verdict on a quote.

export type PriceBand =
  | "BELOW_RANGE"
  | "WITHIN_RANGE"
  | "ABOVE_RANGE"
  | "WELL_ABOVE_RANGE"
  | "NO_REFERENCE";

export type ServiceKind = "STAY" | "TAXI" | "GUIDE" | "TOUR" | "OTHER";

export type Benchmark = {
  id: string;
  serviceType: ServiceKind;
  routeKey: string;
  /** Place name plus aliases, used for fuzzy matching of free-text input. */
  originNames?: string[];
  destinationNames?: string[];
  districtNames?: string[];
  vehicle?: string | null;
  qualifier?: string | null;
  unit: string;
  lowInr: number;
  highInr: number;
  effectiveOn: Date;
  expiresOn?: Date | null;
  isActive?: boolean;
};

export type PriceQuery = {
  service: ServiceKind;
  quotedInr: number;
  /** Taxi: free-text places. */
  origin?: string;
  destination?: string;
  vehicle?: string;
  /** Stay, guide, tour: district name and optional room type / duration / package. */
  district?: string;
  qualifier?: string;
  /** Date to evaluate the tariff on; defaults to now. */
  asOf?: Date;
};

export type PriceResult = {
  band: PriceBand;
  lowInr: number | null;
  highInr: number | null;
  /** How far the quote is above the high end, in percent (0 when not above). */
  percentOverHigh: number;
  benchmarkId: string | null;
  effectiveOn: Date | null;
  unit: string | null;
  match: "exact" | "fuzzy" | "none";
  /** Why there is no reference, when band is NO_REFERENCE. */
  reason?: "no_benchmark" | "ambiguous" | "outdated";
};

/** Above-range limit: a quote up to 1.25 x the high end is only "above"; beyond that, "well above". */
const WELL_ABOVE_NUM = 5;
const WELL_ABOVE_DEN = 4;

/** Classify a quote against a range. Integer maths, so the boundaries are exact. */
export function classifyQuote(quotedInr: number, lowInr: number, highInr: number) {
  if (!Number.isFinite(quotedInr) || quotedInr <= 0) throw new RangeError("quotedInr must be positive");
  if (lowInr > highInr || lowInr < 0) throw new RangeError("Invalid benchmark range");

  let band: Exclude<PriceBand, "NO_REFERENCE">;
  if (quotedInr < lowInr) band = "BELOW_RANGE";
  else if (quotedInr <= highInr) band = "WITHIN_RANGE";
  else if (quotedInr * WELL_ABOVE_DEN <= highInr * WELL_ABOVE_NUM) band = "ABOVE_RANGE";
  else band = "WELL_ABOVE_RANGE";

  const percentOverHigh =
    quotedInr > highInr && highInr > 0
      ? Math.round(((quotedInr - highInr) / highInr) * 1000) / 10
      : 0;
  return { band, percentOverHigh };
}

const tokens = (value: string) => new Set(normalizeText(value).split("-").filter(Boolean));

/**
 * Score how well free text names a place. 1 = same words, lower = one side contains the
 * other (fewer extra words is better), 0 = no match.
 */
export function nameScore(input: string, names: string[] = []) {
  const a = tokens(input);
  if (a.size === 0) return 0;
  let best = 0;
  for (const name of names) {
    const b = tokens(name);
    if (b.size === 0) continue;
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    if (![...small].every((t) => big.has(t))) continue;
    best = Math.max(best, small.size / big.size);
  }
  return best;
}

function isCurrent(b: Benchmark, asOf: Date) {
  if (b.isActive === false) return false;
  if (b.effectiveOn > asOf) return false;
  return !b.expiresOn || b.expiresOn >= asOf;
}

/** Latest tariff wins when the same route has several. */
const newest = (a: Benchmark, b: Benchmark) => b.effectiveOn.getTime() - a.effectiveOn.getTime();

export type MatchResult =
  | { benchmark: Benchmark; match: "exact" | "fuzzy" }
  | { benchmark: null; match: "none"; reason: "no_benchmark" | "ambiguous" | "outdated" };

/** Find the benchmark that applies to a query: exact key first, then fuzzy on place names. */
export function findBenchmark(query: PriceQuery, benchmarks: Benchmark[]): MatchResult {
  const asOf = query.asOf ?? new Date();
  const sameService = benchmarks.filter((b) => b.serviceType === query.service);
  const live = sameService.filter((b) => isCurrent(b, asOf));
  const none = (reason: "no_benchmark" | "ambiguous" | "outdated") =>
    ({ benchmark: null, match: "none", reason }) as const;

  if (query.service === "TAXI") {
    if (!query.origin || !query.destination) return none("no_benchmark");
    const vehicle = query.vehicle ? normalizeText(query.vehicle) : null;
    const byVehicle = (b: Benchmark) => !vehicle || normalizeText(b.vehicle ?? "") === vehicle;

    const key = routeKey(query.origin, query.destination, query.vehicle);
    const exact = live.filter((b) => b.routeKey === key).sort(newest)[0];
    if (exact) return { benchmark: exact, match: "exact" };

    const scored = live
      .filter(byVehicle)
      .map((b) => ({
        b,
        score: Math.min(nameScore(query.origin!, b.originNames), nameScore(query.destination!, b.destinationNames)),
      }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || newest(x.b, y.b));
    if (scored.length === 0) {
      // A route that exists but only with an expired tariff is different from no route at all.
      const stale = sameService.some(
        (b) =>
          byVehicle(b) &&
          Math.min(nameScore(query.origin!, b.originNames), nameScore(query.destination!, b.destinationNames)) > 0,
      );
      return none(stale ? "outdated" : "no_benchmark");
    }
    // Two different routes tie: refuse to guess.
    const top = scored[0];
    const rivals = scored.filter((x) => x.score === top.score && x.b.routeKey !== top.b.routeKey);
    if (rivals.length > 0) return none("ambiguous");
    return { benchmark: top.b, match: "fuzzy" };
  }

  // Stays, guides, tours: district plus optional qualifier.
  if (!query.district) return none("no_benchmark");
  const inDistrict = live
    .map((b) => ({ b, score: nameScore(query.district!, b.districtNames) }))
    .filter((x) => x.score > 0);
  if (inDistrict.length === 0) {
    const stale = sameService.some((b) => nameScore(query.district!, b.districtNames) > 0);
    return none(stale ? "outdated" : "no_benchmark");
  }

  let pool = inDistrict.map((x) => x.b);
  if (query.qualifier) {
    const key = routeKey(query.district, query.qualifier);
    const exact = pool.filter((b) => b.routeKey === key).sort(newest)[0];
    if (exact) return { benchmark: exact, match: "exact" };
    const q = pool
      .map((b) => ({ b, score: nameScore(query.qualifier!, b.qualifier ? [b.qualifier] : []) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || newest(x.b, y.b));
    if (q.length === 0) return none("no_benchmark");
    const rivals = q.filter((x) => x.score === q[0].score && x.b.routeKey !== q[0].b.routeKey);
    if (rivals.length > 0) return none("ambiguous");
    return { benchmark: q[0].b, match: "fuzzy" };
  }
  const keys = new Set(pool.map((b) => b.routeKey));
  if (keys.size > 1) return none("ambiguous");
  pool = pool.sort(newest);
  return { benchmark: pool[0], match: "fuzzy" };
}

/** Find the benchmark and classify the quote against it. */
export function checkPrice(query: PriceQuery, benchmarks: Benchmark[]): PriceResult {
  const found = findBenchmark(query, benchmarks);
  if (found.benchmark === null) {
    return {
      band: "NO_REFERENCE",
      lowInr: null,
      highInr: null,
      percentOverHigh: 0,
      benchmarkId: null,
      effectiveOn: null,
      unit: null,
      match: "none",
      reason: found.reason,
    };
  }
  const { benchmark } = found;
  const { band, percentOverHigh } = classifyQuote(query.quotedInr, benchmark.lowInr, benchmark.highInr);
  return {
    band,
    lowInr: benchmark.lowInr,
    highInr: benchmark.highInr,
    percentOverHigh,
    benchmarkId: benchmark.id,
    effectiveOn: benchmark.effectiveOn,
    unit: benchmark.unit,
    match: found.match,
  };
}
