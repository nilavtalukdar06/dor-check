import type { Identifiers } from "@/lib/identifiers";
import { hostOf, isSafePublicUrl } from "@/lib/research-policy";

/** The six steps of every investigation, in order. The key is also the RunStep key. */
export const INVESTIGATION_STEPS = [
  ["parse-input", "Understand the request"],
  ["search-sources", "Search public sources"],
  ["capture-page", "Capture the page"],
  ["retrieve-benchmarks", "Compare with tariffs and advisories"],
  ["analyse", "Analyse the evidence"],
  ["finalise", "Write the verdict"],
] as const;
export type InvestigationStepKey = (typeof INVESTIGATION_STEPS)[number][0];

/** What a month of usage is counted under (UsageRecord.metric). */
export const INVESTIGATION_METRIC = "investigations";

export const INPUT_TYPES = ["LINK", "BUSINESS_NAME", "MESSAGE", "CONTACT"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

/** The row label: the site for a link, the name, the start of a message. Never a phone or UPI id. */
export function investigationTitle(inputType: InputType, input: string): string {
  const text = input.replace(/\s+/g, " ").trim();
  switch (inputType) {
    case "LINK": {
      const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      return hostOf(url).replace(/^www\./, "") || text.slice(0, 60);
    }
    case "BUSINESS_NAME":
      return text.slice(0, 60);
    case "CONTACT":
      return "Phone or UPI check";
    default:
      return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text;
  }
}

/** The first date of the month in Indian time, as a calendar date (what UsageRecord.periodStart holds). */
export function usagePeriodStart(now: Date): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 link, 1 phone number" for the first timeline line. */
export function describeRequest(ids: Identifiers, inputType: InputType): string {
  const parts = [
    ids.urls.length || (ids.domains.length ? ids.domains.length : 0) ? plural(ids.urls.length || ids.domains.length, "link") : null,
    ids.phones.length ? plural(ids.phones.length, "phone number") : null,
    ids.upis.length ? plural(ids.upis.length, "UPI id") : null,
  ].filter(Boolean);
  if (parts.length) return `Found ${parts.join(", ")}`;
  return inputType === "BUSINESS_NAME" ? "A business name to look up" : "A message to read";
}

/** "5 sources: 1 directory, 2 community reports, 1 web page, 1 advisory". */
export function describeSources(sources: readonly { kind: string; unavailable: boolean }[]): string {
  const usable = sources.filter((s) => !s.unavailable && s.kind !== "USER");
  if (usable.length === 0) return "No sources found yet";
  const names: Record<string, [string, string]> = {
    DIRECTORY: ["directory entry", "directory entries"],
    REPORT: ["community report", "community reports"],
    WEB_PAGE: ["web page", "web pages"],
    TARIFF: ["tariff", "tariffs"],
    ADVISORY: ["advisory", "advisories"],
    KNOWLEDGE: ["knowledge page", "knowledge pages"],
  };
  const counts = new Map<string, number>();
  for (const s of usable) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  const parts = [...counts].map(([k, n]) => plural(n, ...(names[k] ?? [k.toLowerCase()])));
  return `${plural(usable.length, "source")}: ${parts.join(", ")}`;
}

/** The first link in the request that is safe to open in a remote browser. */
export function capturableUrl(ids: Identifiers): string | null {
  return ids.urls.find((u) => isSafePublicUrl(u)) ?? null;
}

/** For display and storage: keeps enough to recognise, hides the rest. */
export const maskPhone = (tenDigits: string) => `${tenDigits.slice(0, 2)}••••••${tenDigits.slice(-2)}`;
export const maskUpi = (upi: string) => {
  const [name, bank] = upi.split("@");
  return `${name.slice(0, 2)}•••@${bank ?? ""}`;
};

export type FoundSource = { kind: string; title: string; label: string | null; url: string | null };

/** A short list of what a step found, kept on the step so the live screen can show it before the verdict exists. */
export function compactSources(sources: readonly { kind: string; title: string; label: string | null; url: string | null; unavailable: boolean }[], limit = 12): FoundSource[] {
  return sources
    .filter((s) => !s.unavailable && s.kind !== "USER")
    .slice(0, limit)
    .map((s) => ({ kind: s.kind, title: s.title.slice(0, 120), label: s.label, url: s.url }));
}
