import { hostOf } from "@/lib/research-policy";

// Recognising the same seller across a pasted link, a message, a phone number or a UPI id.

export type Identifiers = { urls: string[]; domains: string[]; phones: string[]; upis: string[]; emails: string[] };

/** A website's host in canonical form: no scheme, "www.", port or path; lower case. */
export function normalizeDomain(raw: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  return hostOf(withScheme).replace(/^www\./, "");
}

/** The 10-digit national number of an Indian mobile, or null if it is not one. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Stored phone identifiers may carry the country code, so look for both spellings. */
export const phoneVariants = (tenDigits: string) => [tenDigits, `91${tenDigits}`];

export const normalizeUpi = (raw: string) => raw.trim().toLowerCase();

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const UPI_RE = /\b[\w.-]{2,}@[a-z]{2,}\b/gi;
const PHONE_RE = /(?<![\d.])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const BARE_DOMAIN_RE = /(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|in|net|org|co|travel|tours|app|info|biz|online|site|example)\b(?:\/[^\s<>"')]*)?/gi;

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** Pull links, domains, phone numbers, UPI ids and emails out of whatever the person pasted. */
export function extractIdentifiers(text: string): Identifiers {
  const emails = uniq((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()));
  const noEmails = text.replace(EMAIL_RE, " ");
  const upis = uniq((noEmails.match(UPI_RE) ?? []).map(normalizeUpi));
  const noUpi = noEmails.replace(UPI_RE, " ");
  const urls = uniq((noUpi.match(URL_RE) ?? []).map((u) => u.replace(/[.,;]+$/, "")));
  const phones = uniq((noUpi.match(PHONE_RE) ?? []).map(normalizePhone).filter((p): p is string => !!p));
  const bare = (noUpi.replace(URL_RE, " ").match(BARE_DOMAIN_RE) ?? []).map((d) => normalizeDomain(d));
  const domains = uniq([...urls.map(normalizeDomain), ...bare].filter(Boolean));
  return { urls, domains, phones, upis, emails };
}

/** Words that say what a site is for rather than who it is; ignored when judging look-alikes. */
const GENERIC = new Set(["booking", "bookings", "book", "official", "online", "offers", "offer", "direct", "trips", "trip", "tours", "tour", "travel", "travels", "holidays", "stay", "stays", "homestay", "hotel", "hotels", "resort", "resorts", "taxi", "cabs", "cab", "deals", "best"]);

/** The part of a domain that names the business: "shillonghills-homestay.example" -> "shillonghills". */
export function domainName(host: string): string {
  const label = host.replace(/^www\./, "").split(".")[0] ?? "";
  const words = label.split(/[^a-z0-9]+/).filter(Boolean);
  const kept = words.filter((w) => !GENERIC.has(w));
  return (kept.length ? kept : words).join("");
}

const trigrams = (s: string) => {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
};

/** 0 to 1 closeness of two strings (Dice coefficient on trigrams). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a), tb = trigrams(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/**
 * Is `host` a look-alike of one of the registered domains? A different domain whose business
 * name is close to a registered one is a classic fake-listing pattern. Returns the closest.
 */
export function lookalikeOf(host: string, registered: string[], threshold = 0.5): { domain: string; score: number } | null {
  const mine = domainName(host);
  let best: { domain: string; score: number } | null = null;
  for (const r of registered) {
    if (r === host) continue;
    const score = similarity(mine, domainName(r));
    if (score >= threshold && (!best || score > best.score)) best = { domain: r, score };
  }
  return best;
}
