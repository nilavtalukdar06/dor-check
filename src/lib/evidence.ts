import { z } from "zod";

/** Largest upload accepted, in bytes. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** URL tab values and the evidence kinds they stand for. */
export const EVIDENCE_TABS = [
  { value: "all", label: "All", kinds: undefined },
  { value: "screenshots", label: "Screenshots", kinds: ["SCREENSHOT"] },
  { value: "extracts", label: "Extracts", kinds: ["EXTRACT"] },
  { value: "uploads", label: "Uploads", kinds: ["UPLOAD", "DOCUMENT"] },
  { value: "audio", label: "Audio", kinds: ["AUDIO"] },
] as const;

export type EvidenceTab = (typeof EVIDENCE_TABS)[number]["value"];
export type EvidenceKindName = "SCREENSHOT" | "EXTRACT" | "UPLOAD" | "AUDIO" | "DOCUMENT";

export const kindsFor = (tab: EvidenceTab): readonly EvidenceKindName[] | undefined => EVIDENCE_TABS.find((t) => t.value === tab)?.kinds;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const id = z.preprocess(first, z.string().trim().max(40).regex(/^[a-z0-9]+$/i).optional().catch(undefined));

/** Everything the vault page reads from the URL. Unknown values fall back to defaults. */
export const evidenceParamsSchema = z.object({
  type: z.preprocess(first, z.enum(EVIDENCE_TABS.map((t) => t.value) as [EvidenceTab, ...EvidenceTab[]]).catch("all")),
  q: z.preprocess(first, z.string().trim().max(60).catch("")).transform((v) => v || undefined),
  /** Evidence item open in the drawer. */
  item: id,
  /** Capture run being watched live. */
  capture: id,
});
export type EvidenceParams = z.output<typeof evidenceParamsSchema>;

/** Build a vault URL from params, leaving out defaults so URLs stay short. */
export function evidenceHref(p: Partial<EvidenceParams>, path = "/evidence") {
  const sp = new URLSearchParams();
  if (p.type && p.type !== "all") sp.set("type", p.type);
  if (p.q) sp.set("q", p.q);
  if (p.item) sp.set("item", p.item);
  if (p.capture) sp.set("capture", p.capture);
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/** "10 Oct 10:41:19", shown in Indian time so server and browser agree. */
export function formatStamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** "1.2 MB", "340 KB". */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A file-name-safe slug: "Listing page" -> "listing-page". */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "evidence";
