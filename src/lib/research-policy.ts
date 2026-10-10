// Rules for what the research code may fetch and how much of it we keep. Pure, so they are
// easy to test and to reuse (the browser capture phase uses the same URL check).

/** Sites that are login walls, social feeds or never hold a tariff. */
export const DENY_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
  "tiktok.com",
] as const;

/** "https://www.Example.com/x" -> "example.com", or "" for junk. */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isDeniedDomain(host: string) {
  const h = host.toLowerCase().replace(/^www\./, "");
  return DENY_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** True for IPv4 literals in private, loopback, link-local or otherwise internal ranges. */
function isPrivateIPv4(host: string) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIPv6(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  return h === "::" || h === "::1" || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("::ffff:");
}

/**
 * A URL we are willing to fetch: http(s) only, no credentials, and never an address that
 * points inside a network (localhost, private ranges, internal names).
 */
export function isSafePublicUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return false;
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) return false;
  if (!host.includes(".") && !host.includes(":")) return false; // single-label names are internal
  return true;
}

/** Hits we may use: safe URL and not a denied site. */
export const isAllowedSource = (url: string) => isSafePublicUrl(url) && !isDeniedDomain(hostOf(url));

const CHARS_PER_TOKEN = 4;

/**
 * Cut text to roughly `maxTokens` before it reaches a model, preferring to end at a
 * paragraph or sentence boundary. Returns the text unchanged when it already fits.
 */
export function truncateToBudget(text: string, maxTokens: number) {
  const limit = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const para = head.lastIndexOf("\n\n");
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("| \n"));
  const cut = para > limit * 0.6 ? para : sentence > limit * 0.6 ? sentence + 1 : limit;
  return `${head.slice(0, cut).trimEnd()}…`;
}
