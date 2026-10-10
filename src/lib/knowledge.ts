import { createHash } from "node:crypto";
import { formatDuration, rs } from "@/lib/format";
import { CHARS_PER_TOKEN } from "@/lib/research-policy";

// Pure rules for the knowledge base: what gets indexed, how it is split, and what is kept out.

/** Pinecone embeds the `text` field for us with its hosted model; our code never calls an embedding API. */
export const EMBEDDING = {
  model: "llama-text-embed-v2",
  dimension: 1024,
} as const;

export type KnowledgeType = "TARIFF" | "DIRECTORY" | "ADVISORY" | "REPORT";
export const KNOWLEDGE_TYPES: readonly KnowledgeType[] = [
  "TARIFF",
  "DIRECTORY",
  "ADVISORY",
  "REPORT",
];

/** One Pinecone namespace per knowledge type, so searches can be scoped and counted per source. */
export const NAMESPACE: Record<KnowledgeType, string> = {
  TARIFF: "tariffs",
  DIRECTORY: "directory",
  ADVISORY: "advisories",
  REPORT: "reports",
};
export const DOC_TYPE: Record<KnowledgeType, string> = {
  TARIFF: "tariff",
  DIRECTORY: "directory",
  ADVISORY: "advisory",
  REPORT: "report",
};

export const knowledgeTypeOf = (value: string): KnowledgeType | null =>
  (KNOWLEDGE_TYPES as readonly string[]).includes(value)
    ? (value as KnowledgeType)
    : null;

/** Sources that read from our own database. Stable ids, so seeding and syncing agree on them. */
export const INTERNAL_SOURCES: readonly {
  id: string;
  name: string;
  type: KnowledgeType;
  recordUnit: string;
  isLive: boolean;
}[] = [
  {
    id: "internal-tariffs",
    name: "Tariff benchmarks",
    type: "TARIFF",
    recordUnit: "routes",
    isLive: false,
  },
  {
    id: "internal-directory",
    name: "Directory entries",
    type: "DIRECTORY",
    recordUnit: "records",
    isLive: false,
  },
  {
    id: "internal-advisories",
    name: "Advisories",
    type: "ADVISORY",
    recordUnit: "advisories",
    isLive: false,
  },
  {
    id: "internal-reports",
    name: "Past community reports",
    type: "REPORT",
    recordUnit: "records",
    isLive: true,
  },
];

/** About 300 to 500 tokens per chunk keeps each one about a single topic. */
export const CHUNK_TOKENS = 400;
const OVERLAP_TOKENS = 40;
export const estimateTokens = (text: string) =>
  Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * Split text into chunks of at most `maxTokens`, at paragraph then sentence boundaries, with a
 * small overlap so a fact on a boundary is found from either side. Short text stays one chunk.
 */
export function chunkText(
  text: string,
  maxTokens = CHUNK_TOKENS,
  overlapTokens = OVERLAP_TOKENS,
): string[] {
  const clean = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return [];
  if (estimateTokens(clean) <= maxTokens) return [clean];

  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;

  // Sentence-sized units; anything still too long is cut by length.
  const units: string[] = [];
  for (const para of clean.split(/\n\n+/)) {
    for (const sentence of para.split(/(?<=[.!?])\s+|\n/)) {
      let s = sentence.trim();
      while (s.length > maxChars) {
        units.push(s.slice(0, maxChars));
        s = s.slice(maxChars).trim();
      }
      if (s) units.push(s);
    }
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const unit of units) {
    if (length + unit.length + 1 > maxChars && current.length > 0) {
      chunks.push(current.join(" "));
      // Carry the last few sentences forward as overlap.
      const carry: string[] = [];
      let carried = 0;
      for (
        let i = current.length - 1;
        i >= 0 && carried + current[i].length <= overlapChars;
        i--
      ) {
        carry.unshift(current[i]);
        carried += current[i].length + 1;
      }
      current = carry;
      length = carried;
    }
    current.push(unit);
    length += unit.length + 1;
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

/**
 * Contact details never go into the index: it is searched by an assistant that quotes what it
 * finds. Emails, UPI ids and phone numbers are replaced; helpline numbers (4 digits) stay.
 */
export function redactContacts(text: string) {
  return (
    text
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
      .replace(/\b[\w.-]{2,}@[a-z]{2,}\b/gi, "[upi id]")
      // International numbers need their +, so plain digit runs (amounts, ids) are never touched.
      .replace(/\+\d{1,3}[\s-]?\d(?:[\s-]?\d){7,12}(?!\d)/g, "[phone number]")
      // Indian mobiles: 10 digits starting 6 to 9, optionally split 5-5, with an optional 0 or 91 prefix.
      .replace(
        /(?<![\d.])(?:(?:91|0)[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g,
        "[phone number]",
      )
  );
}

export const contentHash = (...parts: (string | null | undefined)[]) =>
  createHash("sha256")
    .update(parts.map((p) => p ?? "").join("␟"))
    .digest("hex");

/** A document ready to be stored and indexed, before it has an id. */
export type DocDraft = {
  /** Stable identity inside its source: "tariff:<id>" for our own data, the page URL for web pages. */
  externalKey: string;
  docType: string;
  title: string;
  /** The citation link. */
  url: string | null;
  text: string;
  language: string;
  districtId: string | null;
  districtName: string | null;
  publishedAt: Date | null;
  /** Extra fields stored with every chunk, e.g. a report's status. Strings, numbers and booleans only. */
  extra: Record<string, string | number | boolean>;
  links: {
    benchmarkId?: string;
    propertyId?: string;
    reportId?: string;
    advisoryId?: string;
  };
};

/** What changes the indexed content. If this is unchanged the document is not re-embedded. */
export const draftHash = (
  d: Pick<DocDraft, "title" | "url" | "text" | "districtName" | "extra">,
) =>
  contentHash(
    d.title,
    d.url,
    d.text,
    d.districtName,
    JSON.stringify(d.extra, Object.keys(d.extra).sort()),
  );

const TYPE_LABEL: Record<string, string> = {
  STAY: "stay",
  TAXI: "taxi",
  GUIDE: "guide",
  TOUR: "tour",
  OTHER: "service",
};
const UNIT_TEXT: Record<string, string> = {
  PER_TRIP: "per trip",
  PER_NIGHT: "per night",
  PER_DAY: "per day",
  PER_PERSON: "per person",
};
const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();
const day = (d: Date) =>
  d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export type TariffInput = {
  id: string;
  serviceType: string;
  vehicle: string | null;
  qualifier: string | null;
  unit: string;
  lowInr: number;
  highInr: number;
  distanceKm: number | string | null;
  durationMin: number | null;
  via: string | null;
  nightSurchargePct: number | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  effectiveOn: Date;
  basis: string;
  originName: string | null;
  destinationName: string | null;
  districtId: string | null;
  districtName: string | null;
};

export function tariffDraft(b: TariffInput): DocDraft {
  const range = `${rs(b.lowInr)} to ${rs(b.highInr)} ${UNIT_TEXT[b.unit] ?? b.unit.toLowerCase().replace("_", " ")}`;
  const sentences: string[] = [];
  let title: string;
  if (b.serviceType === "TAXI" && b.originName && b.destinationName) {
    const vehicle = lower(b.vehicle) || "taxi";
    title = `${b.originName} to ${b.destinationName}, ${vehicle}`;
    sentences.push(
      `Taxi fare, ${vehicle}, from ${b.originName} to ${b.destinationName}${b.via ? ` via ${b.via}` : ""}: ${range}.`,
    );
    const km = b.distanceKm ? `${Number(b.distanceKm)} km` : null;
    const time = b.durationMin
      ? `about ${formatDuration(b.durationMin)}`
      : null;
    if (km || time)
      sentences.push(`The route is ${[km, time].filter(Boolean).join(", ")}.`);
    sentences.push(
      `The same range applies in the reverse direction, from ${b.destinationName} to ${b.originName}.`,
    );
    if (b.nightSurchargePct)
      sentences.push(`A night surcharge of ${b.nightSurchargePct}% applies.`);
  } else {
    const what = b.qualifier ?? TYPE_LABEL[b.serviceType] ?? "service";
    const where = b.districtName ?? b.originName ?? "the region";
    title = `${what} in ${where}`;
    sentences.push(
      `Typical price for ${lower(TYPE_LABEL[b.serviceType]) || "a service"}, ${lower(what)}, in ${where}: ${range}.`,
    );
  }
  sentences.push(
    `Source: ${b.sourceLabel ?? "tariff sheet"}${b.basis === "researched" ? " (researched from public pages)" : ""}, effective ${day(b.effectiveOn)}.`,
  );
  // A tariff with no published page still gets a link: the price check for that place, so a
  // traveller can compare a quote against it.
  const priceLink = `/price?${new URLSearchParams({ service: b.serviceType, place: b.serviceType === "TAXI" ? (b.originName ?? "") : (b.districtName ?? b.originName ?? "") })}`;
  return {
    externalKey: `tariff:${b.id}`,
    docType: "tariff",
    title,
    url: b.sourceUrl ?? priceLink,
    text: sentences.join(" "),
    language: "en",
    districtId: b.districtId,
    districtName: b.districtName,
    publishedAt: b.effectiveOn,
    extra: {
      service: b.serviceType,
      ...(b.vehicle ? { vehicle: b.vehicle } : {}),
      lowInr: b.lowInr,
      highInr: b.highInr,
    },
    links: { benchmarkId: b.id },
  };
}

export type PropertyInput = {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  domain: string | null;
  tags: string[];
  verified: boolean;
  districtId: string;
  districtName: string;
  updatedAt: Date;
};

export function propertyDraft(p: PropertyInput): DocDraft {
  const kind = TYPE_LABEL[p.type] ?? "service";
  const parts = [
    `${p.name} is a ${kind} listed in ${p.districtName}.`,
    p.description
      ? /[.!?]$/.test(p.description.trim())
        ? p.description.trim()
        : `${p.description.trim()}.`
      : null,
    p.tags.length ? `Tags: ${p.tags.join(", ")}.` : null,
    p.verified
      ? "It is verified in the directory."
      : "It is not verified in the directory yet.",
    p.domain ? `Website: ${p.domain}.` : null,
  ].filter(Boolean);
  return {
    externalKey: `property:${p.id}`,
    docType: "directory",
    title: p.name,
    url: `/directory?property=${p.slug}`,
    text: redactContacts(parts.join(" ")),
    language: "en",
    districtId: p.districtId,
    districtName: p.districtName,
    publishedAt: p.updatedAt,
    extra: { service: p.type, verified: p.verified },
    links: { propertyId: p.id },
  };
}

export type AdvisoryInput = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  label: string;
  sourceUrl: string | null;
  districtId: string | null;
  districtName: string | null;
  publishedAt: Date;
};

export function advisoryDraft(a: AdvisoryInput): DocDraft {
  const text = [
    `${a.title}.`.replace(/\.\.$/, "."),
    a.body ? redactContacts(a.body.trim()) : null,
    `${a.label}${a.districtName ? ` for ${a.districtName}` : ""}, published ${day(a.publishedAt)}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    externalKey: `advisory:${a.id}`,
    docType: "advisory",
    title: a.title,
    url: a.sourceUrl,
    text,
    language: "en",
    districtId: a.districtId,
    districtName: a.districtName,
    publishedAt: a.publishedAt,
    extra: { kind: a.kind },
    links: { advisoryId: a.id },
  };
}

export type ReportInput = {
  id: string;
  reference: string;
  category: string;
  summary: string;
  description: string;
  locationText: string | null;
  status: string;
  amountInr: number | null;
  districtId: string;
  districtName: string;
  incidentAt: Date | null;
  createdAt: Date;
};

/**
 * Community reports are allegations, so they are always labelled as not verified. The reporter,
 * the reported business's contact details and its web address are left out: the index holds the
 * pattern ("advance paid, page vanished"), not accusations against a named seller.
 */
export function reportDraft(r: ReportInput): DocDraft {
  const place = [r.locationText, r.districtName]
    .filter((v, i, all) => v && all.indexOf(v) === i)
    .join(", ");
  const text = redactContacts(
    [
      `Community report ${r.reference} (not verified): ${r.summary}.`.replace(
        /\.\.$/,
        ".",
      ),
      r.description.trim(),
      `Category: ${lower(TYPE_LABEL[r.category]) || lower(r.category)}. Place: ${place}.`,
      r.amountInr ? `Amount involved: ${rs(r.amountInr)}.` : null,
      `Review status: ${r.status.toLowerCase().replace("_", " ")}.`,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return {
    externalKey: `report:${r.id}`,
    docType: "report",
    title: `Report ${r.reference}: ${r.summary}`,
    url: null,
    text,
    language: "en",
    districtId: r.districtId,
    districtName: r.districtName,
    publishedAt: r.incidentAt ?? r.createdAt,
    extra: { service: r.category, status: r.status, reference: r.reference },
    links: { reportId: r.id },
  };
}

/** One page of a crawled site. */
export function pageDraft(page: {
  url: string;
  title: string;
  text: string;
  retrievedAt: Date;
}): DocDraft {
  return {
    externalKey: page.url,
    docType: "page",
    title: page.title,
    url: page.url,
    text: page.text,
    language: "en",
    districtId: null,
    districtName: null,
    publishedAt: null,
    extra: {},
    links: {},
  };
}

export type ChunkRecord = { _id: string } & Record<
  string,
  string | number | boolean
>;

/** The record Pinecone stores: `text` is what it embeds, the rest is filterable metadata. Null fields are left out (Pinecone rejects them). */
export function buildRecords(
  doc: {
    id: string;
    title: string;
    url: string | null;
    docType: string;
    districtName: string | null;
    language: string | null;
    retrievedAt: Date;
    extra: Record<string, string | number | boolean>;
  },
  source: { id: string; name: string },
  chunks: string[],
): ChunkRecord[] {
  return chunks.map((text, i) => ({
    _id: `${doc.id}:${i}`,
    text,
    title: doc.title,
    ...(doc.url ? { url: doc.url } : {}),
    type: doc.docType,
    source: source.name,
    sourceId: source.id,
    ...(doc.districtName ? { district: doc.districtName } : {}),
    language: doc.language ?? "en",
    retrievedAt: doc.retrievedAt.toISOString(),
    retrievedTs: doc.retrievedAt.getTime(),
    docId: doc.id,
    chunk: i,
    ...doc.extra,
  }));
}

export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/** Run `fn` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
