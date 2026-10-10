import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { EvidenceLedger, LedgerKind } from "@/lib/evidence-ledger";
import { domainName, lookalikeOf, normalizeDomain, normalizePhone, normalizeUpi } from "@/lib/identifiers";
import { KNOWLEDGE_TYPES } from "@/lib/knowledge";
import type { PriceQuery } from "@/lib/price";
import { rs } from "@/lib/format";
import { hostOf } from "@/lib/research-policy";
import type { DirectoryData, ReportData } from "@/server/agent-data";
import type { CaptureResult } from "@/server/capture";
import type { PriceLookup } from "@/server/price";
import type { ResearchHit, ScrapeResult } from "@/server/research";
import type { RetrievedChunk, RetrieveOptions } from "@/server/retrieve";

// The agent's tools. Each one reads from one place, registers what it read in the evidence
// ledger (so the verdict can cite it), and returns a small JSON answer. A tool never throws into
// the model's loop and never has side effects: nothing here types, clicks, submits or pays.

export type ToolCallRecord = {
  name: string;
  input: unknown;
  output: unknown;
  status: "COMPLETED" | "FAILED";
  error?: string;
  durationMs: number;
};

export type AgentOptions = { research: boolean; capture: boolean; knowledge: boolean; price: boolean };

/** Everything a tool talks to. Real services by default; fakes in tests. */
export type AgentDeps = {
  searchWeb: (query: string, o?: { limit?: number }) => Promise<ResearchHit[]>;
  scrapeUrl: (url: string) => Promise<ScrapeResult>;
  /** Present only when page capture is allowed for this run. */
  capturePage?: (url: string) => Promise<CaptureResult>;
  retrieve: (query: string, o?: RetrieveOptions) => Promise<RetrievedChunk[]>;
  lookupPrice: (q: PriceQuery) => Promise<PriceLookup>;
  directory: DirectoryData;
  reports: ReportData;
  record: (call: ToolCallRecord) => void | Promise<void>;
};

/** At most this many calls of each tool in one run, so a confused loop cannot run up a bill. */
export const CALL_LIMITS: Record<string, number> = { searchWeb: 3, scrapePage: 4, capturePage: 1, retrieveKnowledge: 5, lookupDirectory: 4, findSimilarReports: 4, comparePrice: 3 };

const KIND_OF: Record<string, LedgerKind> = { tariff: "TARIFF", directory: "DIRECTORY", advisory: "ADVISORY", report: "REPORT", page: "KNOWLEDGE" };
const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export type ToolContext = { ledger: EvidenceLedger; deps: AgentDeps; options: AgentOptions; /** Calls made so far per tool, shared by the agent and the runner's own lookups. */ calls: Record<string, number> };

/** Wrap a tool body: enforce the call limit, time it, record it, and turn a crash into a plain "could not". */
export function tracked<I>(name: string, ctx: ToolContext, run: (input: I) => Promise<Record<string, unknown>>) {
  return async (input: I): Promise<Record<string, unknown>> => {
    ctx.calls[name] = (ctx.calls[name] ?? 0) + 1;
    if (ctx.calls[name] > (CALL_LIMITS[name] ?? 4)) {
      const out = { ok: false, error: `Call limit reached for ${name}. Use what you already have.` };
      await ctx.deps.record({ name, input, output: out, status: "FAILED", error: "call limit", durationMs: 0 });
      return out;
    }
    const started = Date.now();
    try {
      const output = await run(input);
      await ctx.deps.record({ name, input, output, status: "COMPLETED", durationMs: Date.now() - started });
      return output;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const output = { ok: false, error: `${name} could not complete.` };
      await ctx.deps.record({ name, input, output, status: "FAILED", error: message.slice(0, 300), durationMs: Date.now() - started });
      return output;
    }
  };
}

const domainField = z.string().optional().describe("A website or domain, e.g. example.com or a full link.");
const phoneField = z.string().optional().describe("A phone number as written.");
const upiField = z.string().optional().describe("A UPI id such as name@bank.");

// ───────────── the lookups the runner also performs up front, so the agent starts informed ─────────────

export type DirectoryQuery = { domain?: string; name?: string; phone?: string; upi?: string };
export type ReportQuery = DirectoryQuery & { text?: string; district?: string };

/** Is this seller in the directory? Registers each match, or the absence of one, in the ledger. */
export async function lookupDirectory(ctx: ToolContext, q: DirectoryQuery) {
  const domain = q.domain ? normalizeDomain(q.domain) : null;
  const phone = q.phone ? normalizePhone(q.phone) : null;
  const upi = q.upi ? normalizeUpi(q.upi) : null;
  if (!domain && !phone && !upi && !q.name?.trim()) return { ok: false, error: "Give at least a domain, phone, UPI id or name." };

  const found = await ctx.deps.directory.findByIdentifiers({ domains: domain ? [domain] : [], phones: phone ? [phone] : [], upis: upi ? [upi] : [] });
  const byName = q.name?.trim() ? await ctx.deps.directory.findByName(q.name) : [];
  const seen = new Set(found.map((m) => m.propertyId));
  const matches = [...found, ...byName.filter((m) => !seen.has(m.propertyId))];

  const out = matches.map((m) => {
    const exact = m.matchedOn.some((x) => x !== "name");
    const sourceId = ctx.ledger.add(
      {
        kind: "DIRECTORY",
        title: m.name,
        url: `/directory?property=${m.slug}`,
        via: "directory",
        domain: m.domain,
        meta: { exactMatch: exact, verified: m.verified, matchedOn: m.matchedOn.join("+") },
        excerpt: `${m.name} is a ${m.type.toLowerCase()} listed in ${m.districtName}. It is ${m.verified ? "verified" : "not verified"} in the directory. Matched on: ${m.matchedOn.join(", ")}.`,
        links: { propertyId: m.propertyId },
      },
      `property:${m.propertyId}`,
    );
    return { sourceId, name: m.name, type: m.type, district: m.districtName, verified: m.verified, matchedOn: m.matchedOn, exactMatch: exact };
  });

  // A domain that is not registered but closely resembles one that is.
  let lookalike: { domain: string; score: number; sourceId: string; name: string } | null = null;
  if (domain && !matches.some((m) => m.matchedOn.includes("domain"))) {
    const near = lookalikeOf(domain, await ctx.deps.directory.registeredDomains());
    if (near) {
      const owner = (await ctx.deps.directory.findByIdentifiers({ domains: [near.domain], phones: [], upis: [] }))[0];
      const sourceId = ctx.ledger.add(
        {
          kind: "DIRECTORY",
          title: owner ? owner.name : `Registered business at ${near.domain}`,
          url: owner ? `/directory?property=${owner.slug}` : null,
          via: "directory",
          domain: near.domain,
          meta: { exactMatch: false, verified: owner?.verified ?? null, lookalikeScore: Math.round(near.score * 100) / 100 },
          excerpt: `A registered business uses ${near.domain}. The domain being checked, ${domain}, is different but has a very similar business name (${domainName(near.domain)} and ${domainName(domain)}).`,
          links: owner ? { propertyId: owner.propertyId } : {},
        },
        `property:${owner?.propertyId ?? near.domain}`,
      );
      lookalike = { ...near, sourceId, name: owner?.name ?? near.domain };
    }
  }

  // "Not found" is itself a finding the verdict may cite.
  let notFoundId: string | null = null;
  if (matches.length === 0) {
    const what = [domain && `domain ${domain}`, phone && "that phone number", upi && "that UPI id", q.name && `the name "${q.name.trim()}"`].filter(Boolean).join(", ");
    notFoundId = ctx.ledger.add(
      { kind: "DIRECTORY", title: "Directory search", label: "no listing found", via: "directory", meta: { exactMatch: false, found: false }, excerpt: `No directory listing matches ${what}. Not being listed is not a warning by itself.` },
      `dirsearch:${[domain, phone, upi, q.name?.trim().toLowerCase()].filter(Boolean).join("|")}`,
    );
  }
  return { ok: true, found: matches.length > 0, matches: out, lookalike, notFoundSourceId: notFoundId };
}

/** Community reports about the same website, phone or UPI id, plus similar reports by meaning. */
export async function findSimilarReports(ctx: ToolContext, q: ReportQuery) {
  const domain = q.domain ? normalizeDomain(q.domain) : null;
  const phone = q.phone ? normalizePhone(q.phone) : null;
  const upi = q.upi ? normalizeUpi(q.upi) : null;
  const exact = await ctx.deps.reports.findByIdentifiers({ domains: domain ? [domain] : [], phones: phone ? [phone] : [], upis: upi ? [upi] : [] });

  const exactOut = exact.map((r) => ({
    sourceId: ctx.ledger.add(
      {
        kind: "REPORT",
        title: `Report ${r.reference}: ${r.summary}`,
        label: `community report ${r.reference}`,
        via: "report",
        meta: { status: r.status, sameIdentifier: r.matchedOn.join("+") },
        excerpt: `Community report ${r.reference} (not verified), status ${r.status.toLowerCase().replace("_", " ")}, in ${r.districtName}: ${r.summary}. It names the same ${r.matchedOn.join(" and ")} being checked.`,
        links: { reportId: r.id },
      },
      `report:${r.id}`,
    ),
    reference: r.reference,
    status: r.status,
    category: r.category,
    district: r.districtName,
    summary: r.summary,
    sameIdentifier: r.matchedOn,
  }));

  let similar: { sourceId: string; title: string; status: string | null; score: number }[] = [];
  if (q.text?.trim() && ctx.options.knowledge) {
    const hits = await ctx.deps.retrieve(q.text, { types: ["REPORT"], topK: 3, ...(q.district ? { district: q.district } : {}), minScore: 0.3 });
    similar = hits.map((h) => ({
      sourceId: ctx.ledger.add(
        { kind: "REPORT", title: h.title, label: "community report", via: "pinecone", meta: { status: h.status, score: Math.round(h.score * 100) / 100 }, excerpt: h.text, links: { knowledgeDocumentId: h.documentId } },
        `doc:${h.documentId}`,
      ),
      title: h.title,
      status: h.status,
      score: Math.round(h.score * 100) / 100,
    }));
  }
  return { ok: true, sameIdentifier: exactOut, similarByMeaning: similar, note: "Community reports are unverified allegations: signals, never proof." };
}

// ───────────── the tool set ─────────────

/** Build the tools for one run. Which ones exist depends on the options chosen and what is available. */
export function createAgentTools(ctx: ToolContext) {
  const { deps, ledger, options } = ctx;
  const tools: ToolSet = {};

  tools.lookupDirectory = tool({
    description: "Check whether a seller is listed in the regional directory of registered tourism businesses, by website domain, phone number, UPI id or name. Also reports a domain that closely resembles a registered business. Call this first for any link, phone or UPI id.",
    inputSchema: z.object({ domain: domainField, name: z.string().optional().describe("Business name as written."), phone: phoneField, upi: upiField }),
    execute: tracked("lookupDirectory", ctx, (q: DirectoryQuery) => lookupDirectory(ctx, q)),
  });

  tools.findSimilarReports = tool({
    description: "Find community reports (unverified allegations) that name the same website, phone number or UPI id, and similar reports by meaning. Use it for every link, phone or UPI id you are asked to check.",
    inputSchema: z.object({ domain: domainField, phone: phoneField, upi: upiField, text: z.string().optional().describe("A short description of the situation, to find similar past reports."), district: z.string().optional() }),
    execute: tracked("findSimilarReports", ctx, (q: ReportQuery) => findSimilarReports(ctx, q)),
  });

  if (options.knowledge) {
    tools.retrieveKnowledge = tool({
      description: "Search the knowledge base of tariffs, directory entries, advisories and past reports by meaning. Use it for fares, regional advisories and how typical scams work.",
      inputSchema: z.object({
        query: z.string().min(3).describe("What to look for, in plain words."),
        types: z.array(z.enum(KNOWLEDGE_TYPES as [string, ...string[]])).optional().describe("Limit to some of: TARIFF, DIRECTORY, ADVISORY, REPORT."),
        district: z.string().optional().describe("District name, e.g. Shillong."),
      }),
      execute: tracked("retrieveKnowledge", ctx, async (q: { query: string; types?: string[]; district?: string }) => {
        const hits = await deps.retrieve(q.query, { topK: 5, ...(q.types?.length ? { types: q.types as never } : {}), ...(q.district ? { district: q.district } : {}), minScore: 0.25 });
        return {
          ok: true,
          results: hits.map((h) => ({
            sourceId: ledger.add(
              {
                kind: KIND_OF[h.type] ?? "KNOWLEDGE",
                title: h.title,
                url: h.url,
                label: h.type === "report" ? "community report" : h.sourceName,
                via: "pinecone",
                meta: { score: Math.round(h.score * 100) / 100, status: h.status },
                excerpt: h.text,
                links: { knowledgeDocumentId: h.documentId },
              },
              `doc:${h.documentId}`,
            ),
            title: h.title,
            type: h.type,
            district: h.district,
            text: clip(h.text, 400),
            score: Math.round(h.score * 100) / 100,
            status: h.status,
          })),
        };
      }),
    });
  }

  if (options.price) {
    tools.comparePrice = tool({
      description: "Compare a quoted price with the reference tariff for a taxi route, a stay, a guide or a tour. Only call it when a price was quoted.",
      inputSchema: z.object({
        service: z.enum(["TAXI", "STAY", "GUIDE", "TOUR"]),
        quotedInr: z.number().positive().describe("The quoted price in rupees."),
        origin: z.string().optional().describe("Taxi: where from."),
        destination: z.string().optional().describe("Taxi: where to."),
        district: z.string().optional().describe("Stay, guide, tour: the district or place."),
        vehicle: z.string().optional().describe("Taxi: SEDAN, SUV, HATCHBACK, VAN, AUTO or SHARED."),
        qualifier: z.string().optional().describe("Room type, guide duration or tour package."),
      }),
      execute: tracked("comparePrice", ctx, async (q: PriceQuery) => {
        const r = await deps.lookupPrice(q);
        if (r.band === "NO_REFERENCE" || r.lowInr === null || r.highInr === null) {
          return { ok: true, band: "NO_REFERENCE", reason: r.reason ?? "no_benchmark", note: "We have no reference tariff for this. Do not treat the price as fair or unfair." };
        }
        const unit = (r.unit ?? "PER_TRIP").toLowerCase().replace("_", " ");
        const sourceId = ledger.add(
          {
            kind: "TARIFF",
            title: `Reference tariff: ${q.service.toLowerCase()}${q.origin ? ` ${q.origin} to ${q.destination ?? ""}` : q.district ? ` in ${q.district}` : ""}`,
            label: r.details?.sourceLabel ?? "tariff sheet",
            url: r.details?.sourceUrl ?? "/price",
            via: "price",
            meta: { band: r.band, lowInr: r.lowInr, highInr: r.highInr, quotedInr: q.quotedInr, basis: r.basis },
            excerpt: `Reference range ${rs(r.lowInr)} to ${rs(r.highInr)} ${unit}${r.reversed ? " (tariff written for the reverse direction)" : ""}. The quote of ${rs(q.quotedInr)} is ${r.band.toLowerCase().replace("_", " ")}${r.percentOverHigh > 0 ? `, ${r.percentOverHigh}% above the top of the range` : ""}.`,
            links: { benchmarkId: r.benchmarkId ?? undefined },
          },
          `bench:${r.benchmarkId}:${q.quotedInr}`,
        );
        return { ok: true, sourceId, band: r.band, lowInr: r.lowInr, highInr: r.highInr, unit: r.unit, percentOverHigh: r.percentOverHigh, reversed: r.reversed, match: r.match, basis: r.basis, confidence: r.confidence };
      }),
    });
  }

  if (options.research) {
    tools.searchWeb = tool({
      description: "Search the public web. Results are only titles, links and short snippets from search engines: weak evidence on their own. Read a page with scrapePage before relying on it.",
      inputSchema: z.object({ query: z.string().min(3).describe("A focused search, e.g. the business name plus 'reviews' or the website plus 'complaints'.") }),
      execute: tracked("searchWeb", ctx, async (q: { query: string }) => {
        const hits = await deps.searchWeb(q.query, { limit: 5 });
        return {
          ok: true,
          results: hits.map((h) => ({
            sourceId: ledger.add({ kind: "WEB_PAGE", title: h.title, url: h.url, via: "firecrawl", domain: h.domain, snippet: h.snippet, retrievedAt: h.retrievedAt }, h.url),
            title: h.title,
            url: h.url,
            domain: h.domain,
            snippet: clip(h.snippet, 240),
          })),
        };
      }),
    });

    tools.scrapePage = tool({
      description: "Read one public web page as text. Read-only. A page that cannot be read comes back as unavailable and is not evidence.",
      inputSchema: z.object({ url: z.string().describe("A full http or https address.") }),
      execute: tracked("scrapePage", ctx, async (q: { url: string }) => {
        const page = await deps.scrapeUrl(q.url);
        if (!page.ok) {
          const sourceId = ledger.add({ kind: "WEB_PAGE", title: hostOf(q.url), url: q.url, via: "firecrawl", domain: page.domain, unavailable: true, retrievedAt: page.retrievedAt }, q.url);
          return { ok: false, sourceId, reason: page.reason === "blocked" ? "This address cannot be opened." : "The page could not be read." };
        }
        const sourceId = ledger.add({ kind: "WEB_PAGE", title: page.title, url: page.url, via: "firecrawl", domain: page.domain, excerpt: page.text, retrievedAt: page.retrievedAt }, page.url);
        return { ok: true, sourceId, title: page.title, text: page.text };
      }),
    });
  }

  if (options.capture && deps.capturePage) {
    const capture = deps.capturePage;
    tools.capturePage = tool({
      description: "Open the page in a secure remote browser, take a timestamped screenshot as evidence and read what the page says (prices, payment instructions, UPI ids). Read-only: it never types, clicks or submits. Slow and costly; use at most once, only for a link the evidence so far does not settle.",
      inputSchema: z.object({ url: z.string().describe("A full http or https address.") }),
      execute: tracked("capturePage", ctx, async (q: { url: string }) => {
        const res = await capture(q.url);
        if (!res.ok) {
          const sourceId = ledger.add({ kind: "WEB_PAGE", title: hostOf(q.url), url: q.url, via: "browserbase", unavailable: true }, `capture:${q.url}`);
          return { ok: false, sourceId, reason: res.message };
        }
        const sourceId = ledger.add(
          {
            kind: "WEB_PAGE",
            title: res.pageTitle ?? hostOf(res.finalUrl),
            url: res.finalUrl,
            via: "browserbase",
            domain: hostOf(res.finalUrl),
            meta: { asksForAdvancePayment: res.facts?.asksForAdvancePayment ?? null, screenshot: res.evidence.some((e) => e.kind === "SCREENSHOT") },
            excerpt: res.facts ? JSON.stringify(res.facts) : "The page text could not be read; a screenshot was saved.",
          },
          `capture:${res.finalUrl}`,
        );
        return { ok: true, sourceId, title: res.pageTitle, finalUrl: res.finalUrl, facts: res.facts, evidenceSaved: res.evidence.length };
      }),
    });
  }

  return tools;
}
