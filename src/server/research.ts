import { createHash } from "node:crypto";
import Firecrawl from "@mendable/firecrawl-js";
import { env } from "@/lib/env";
import prisma from "@/lib/prisma";
import { withRetry } from "@/lib/retry";
import { DENY_DOMAINS, hostOf, isAllowedSource, isSafePublicUrl, truncateToBudget } from "@/lib/research-policy";

// Public-web research for the whole app: search, scrape, and record what was found with its
// URL and retrieval time. A page we could not fetch is "source unavailable", never evidence.

/** About 1,500 tokens of page text is plenty for a model to find prices or facts. */
export const PAGE_TOKEN_BUDGET = 1500;
const EXCERPT_CHARS = 1500;

export type ResearchHit = {
  url: string;
  title: string;
  domain: string;
  /** The search engine's short description. */
  snippet: string | null;
  /** Page text as markdown, trimmed to the token budget. Only when `includeText` was asked for. */
  text: string | null;
  retrievedAt: string;
};

export type ScrapeResult =
  | { ok: true; url: string; title: string; domain: string; text: string; httpStatus: number | null; retrievedAt: string }
  | { ok: false; url: string; domain: string; reason: "blocked" | "unavailable"; retrievedAt: string };

export const researchAvailable = () => Boolean(env.FIRECRAWL_API_KEY);

/** The SDK needs maxRetries of at least 1 to make a request; withRetry below owns real retrying. */
function client(timeoutMs: number) {
  if (!env.FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not set");
  return new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY, timeoutMs, maxRetries: 1 });
}

type Doc = {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
  metadata?: { title?: string; description?: string; sourceURL?: string; url?: string; statusCode?: number };
};

/** Quota or auth problems will not fix themselves on a retry. */
const retryable = (err: unknown) => !/\b(401|402|403)\b|unauthorized|payment|insufficient/i.test(String(err));

/**
 * Search the public web. Hits on denied sites and unsafe addresses are dropped. Throws when the
 * service stays down after retries, so callers can tell "no results" from "could not search".
 */
export async function searchWeb(
  query: string,
  { limit = 5, includeText = false }: { limit?: number; includeText?: boolean } = {},
): Promise<ResearchHit[]> {
  // Searching and scraping every result takes longer than searching alone. Two attempts must
  // fit inside one Inngest step (the /api/inngest route allows 60 s); a failed step is retried.
  const attemptMs = includeText ? 28_000 : 25_000;
  const res = await withRetry(
    () =>
      client(attemptMs).search(query, {
        limit,
        country: "IN",
        excludeDomains: [...DENY_DOMAINS],
        timeout: attemptMs - 5_000,
        ...(includeText ? { scrapeOptions: { formats: ["markdown" as const], onlyMainContent: true } } : {}),
      }),
    { retries: includeText ? 1 : 2, timeoutMs: attemptMs, shouldRetry: retryable },
  );

  const retrievedAt = new Date().toISOString();
  const seen = new Set<string>();
  const hits: ResearchHit[] = [];
  for (const d of (res.web ?? []) as Doc[]) {
    const url = d.url ?? d.metadata?.sourceURL ?? d.metadata?.url;
    if (!url || seen.has(url) || !isAllowedSource(url)) continue;
    seen.add(url);
    const markdown = d.markdown?.trim();
    hits.push({
      url,
      title: d.title ?? d.metadata?.title ?? hostOf(url),
      domain: hostOf(url),
      snippet: d.description ?? d.metadata?.description ?? null,
      text: includeText && markdown && markdown.length >= 200 ? truncateToBudget(markdown, PAGE_TOKEN_BUDGET) : null,
      retrievedAt,
    });
  }
  return hits;
}

/** Fetch one public page as markdown. Never throws: failures come back as `ok: false`. */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const retrievedAt = new Date().toISOString();
  const domain = hostOf(url);
  if (!isSafePublicUrl(url) || !isAllowedSource(url)) return { ok: false, url, domain, reason: "blocked", retrievedAt };

  try {
    const doc = (await withRetry(() => client(30_000).scrape(url, { formats: ["markdown"], onlyMainContent: true, timeout: 25_000 }), {
      retries: 1,
      timeoutMs: 30_000,
      shouldRetry: retryable,
    })) as Doc;
    const markdown = doc.markdown?.trim();
    const status = doc.metadata?.statusCode ?? null;
    if (!markdown || (status !== null && status >= 400)) return { ok: false, url, domain, reason: "unavailable", retrievedAt };
    return {
      ok: true,
      url,
      domain,
      title: doc.metadata?.title ?? hostOf(url),
      text: truncateToBudget(markdown, PAGE_TOKEN_BUDGET),
      httpStatus: status,
      retrievedAt,
    };
  } catch {
    return { ok: false, url, domain, reason: "unavailable", retrievedAt };
  }
}

type Saveable = ResearchHit | ScrapeResult;

/**
 * Record what research found as Source rows: URL, title, retrieval time, a short excerpt and a
 * content hash. Pages that could not be fetched are stored flagged `unavailable`, with no excerpt.
 */
export async function saveSources(items: Saveable[], owner: { investigationId?: string } = {}) {
  const rows = items.map((item) => {
    const unavailable = "ok" in item && !item.ok;
    const text = "text" in item ? item.text : null;
    return {
      investigationId: owner.investigationId ?? null,
      kind: "WEB_PAGE" as const,
      url: item.url,
      title: "title" in item ? item.title : item.domain,
      domain: item.domain,
      snippet: "snippet" in item ? (item.snippet?.slice(0, 300) ?? null) : null,
      excerpt: text ? text.slice(0, EXCERPT_CHARS) : null,
      via: "firecrawl",
      retrievedAt: new Date(item.retrievedAt),
      contentHash: text ? createHash("sha256").update(text).digest("hex") : null,
      httpStatus: "httpStatus" in item ? item.httpStatus : null,
      unavailable,
    };
  });
  if (rows.length === 0) return [];
  return prisma.source.createManyAndReturn({ data: rows });
}
