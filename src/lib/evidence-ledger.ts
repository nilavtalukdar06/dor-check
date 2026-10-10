export type LedgerKind = "WEB_PAGE" | "DIRECTORY" | "TARIFF" | "REPORT" | "ADVISORY" | "KNOWLEDGE" | "USER";

export type LedgerSource = {
  /** "S1", "S2"… The only thing the model may cite. URLs are never written by the model. */
  id: string;
  kind: LedgerKind;
  title: string;
  url: string | null;
  /** "community report TTD-7K2M9Q" when there is no URL. */
  label: string | null;
  /** "firecrawl", "browserbase", "pinecone", "directory", "report", "price". */
  via: string;
  domain: string | null;
  snippet: string | null;
  excerpt: string | null;
  retrievedAt: string;
  /** Fetch failed: recorded, but never evidence. */
  unavailable: boolean;
  /** Tool-specific facts the rules need, e.g. { exactMatch: true } for a directory hit. */
  meta: Record<string, string | number | boolean | null>;
  links: { knowledgeDocumentId?: string; reportId?: string; benchmarkId?: string; propertyId?: string };
};

export type NewSource = Omit<LedgerSource, "id" | "retrievedAt" | "unavailable" | "meta" | "links" | "snippet" | "excerpt" | "domain" | "label" | "url"> &
  Partial<Pick<LedgerSource, "retrievedAt" | "unavailable" | "meta" | "links" | "snippet" | "excerpt" | "domain" | "label" | "url">>;

/**
 * Everything the tools found in one investigation, with a short id each. Tools register what
 * they read; the verdict may only cite these ids. The same document found twice keeps one id.
 */
export class EvidenceLedger {
  private sources: LedgerSource[] = [];
  private byKey = new Map<string, string>();
  /** Counts only tool-found sources, so the traveller's own message (U1) never shifts S1, S2… */
  private found = 0;

  constructor(private now: () => Date = () => new Date()) {}

  /** Add a source, or return the id of the one already registered under `key`. */
  add(source: NewSource, key?: string): string {
    const existing = key ? this.byKey.get(key) : undefined;
    if (existing) {
      // A later read can improve what we know (e.g. an excerpt, or a match flag).
      const prior = this.sources.find((s) => s.id === existing)!;
      Object.assign(prior.meta, source.meta ?? {});
      if (!prior.excerpt && source.excerpt) prior.excerpt = source.excerpt;
      if (prior.unavailable && source.unavailable === false) prior.unavailable = false;
      return existing;
    }
    const id = `S${++this.found}`;
    this.sources.push({
      url: null,
      label: null,
      domain: null,
      snippet: null,
      excerpt: null,
      unavailable: false,
      ...source,
      id,
      retrievedAt: source.retrievedAt ?? this.now().toISOString(),
      meta: { ...(source.meta ?? {}) },
      links: { ...(source.links ?? {}) },
    });
    if (key) this.byKey.set(key, id);
    return id;
  }

  /**
   * The traveller's own words as a citable source ("U1"): the finding "asks for an advance on a
   * personal UPI id" is evidence even though no tool found it. It is never independent evidence.
   */
  addUserInput(text: string): string {
    this.sources.unshift({
      id: "U1",
      kind: "USER",
      title: "What you sent",
      label: "your message",
      url: null,
      via: "user",
      domain: null,
      snippet: null,
      excerpt: text.replace(/\s+/g, " ").trim().slice(0, 800),
      retrievedAt: this.now().toISOString(),
      unavailable: false,
      meta: {},
      links: {},
    });
    return "U1";
  }

  get(id: string) {
    return this.sources.find((s) => s.id === id);
  }

  all(): readonly LedgerSource[] {
    return this.sources;
  }

  /** Sources that can count as evidence. */
  usable(): LedgerSource[] {
    return this.sources.filter((s) => !s.unavailable);
  }
}
