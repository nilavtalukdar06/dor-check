import { z } from "zod";
import { pickedGeoSchema } from "@/lib/price-schema";

// Rules for community reports that do not touch the database, so the form, the server and the
// tests all agree on them.

export const REPORT_STATUSES = ["NEW", "UNDER_REVIEW", "VERIFIED", "RESOLVED", "CLOSED", "REJECTED"] as const;
export type ReportStatusName = (typeof REPORT_STATUSES)[number];

export const REPORT_KINDS = ["SCAM", "FARE_DISPUTE", "OTHER"] as const;
export const REPORT_CATEGORIES = ["STAY", "TAXI", "GUIDE", "TOUR", "OTHER"] as const;

export const KIND_LABEL: Record<(typeof REPORT_KINDS)[number], string> = { SCAM: "Scam or fake listing", FARE_DISPUTE: "Overcharging or fare dispute", OTHER: "Something else" };
export const CATEGORY_LABEL: Record<(typeof REPORT_CATEGORIES)[number], string> = { STAY: "Accommodation", TAXI: "Taxi", GUIDE: "Guide", TOUR: "Tour", OTHER: "Something else" };
export const STATUS_LABEL: Record<ReportStatusName, string> = { NEW: "New", UNDER_REVIEW: "Under review", VERIFIED: "Verified", RESOLVED: "Resolved", CLOSED: "Closed", REJECTED: "Rejected" };
export const STATUS_VARIANT: Record<ReportStatusName, "info" | "warning" | "ok" | "outline" | "danger"> = { NEW: "info", UNDER_REVIEW: "warning", VERIFIED: "ok", RESOLVED: "ok", CLOSED: "outline", REJECTED: "danger" };

// ───────────────────────── Reference ─────────────────────────

/** No 0, 1, I, L or O: a reference read aloud or copied by hand cannot be mistaken. */
export const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERENCE_RE = /^TTD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
/** Older (seeded) references may use any capital letters and digits. */
export const ANY_REFERENCE_RE = /^TTD-[A-Z0-9]{6}$/;

export function generateReference(random: (max: number) => number = (max) => crypto.getRandomValues(new Uint32Array(1))[0] % max): string {
  let out = "TTD-";
  for (let i = 0; i < 6; i++) out += REFERENCE_ALPHABET[random(REFERENCE_ALPHABET.length)];
  return out;
}

// ───────────────────────── Status machine ─────────────────────────

/**
 * Where a report may go next. A moderator moves it forward; a closed or rejected report stays
 * that way (a moderator who wants to look again opens a new review through UNDER_REVIEW only
 * from NEW or VERIFIED, never from a final state).
 */
export const TRANSITIONS: Record<ReportStatusName, readonly ReportStatusName[]> = {
  NEW: ["UNDER_REVIEW", "REJECTED", "CLOSED"],
  UNDER_REVIEW: ["VERIFIED", "RESOLVED", "CLOSED", "REJECTED"],
  VERIFIED: ["RESOLVED", "CLOSED", "UNDER_REVIEW"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
  REJECTED: [],
};

export const canTransition = (from: ReportStatusName, to: ReportStatusName) => TRANSITIONS[from].includes(to);

/** The statuses that still lie ahead, shown greyed in the history: Under review, then Resolved. */
export function upcomingSteps(status: ReportStatusName): ReportStatusName[] {
  switch (status) {
    case "NEW":
      return ["UNDER_REVIEW", "RESOLVED"];
    case "UNDER_REVIEW":
    case "VERIFIED":
      return ["RESOLVED"];
    default:
      return [];
  }
}

// ───────────────────────── The form ─────────────────────────

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

export const reportInputSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  category: z.enum(REPORT_CATEGORIES),
  summary: z.string().trim().min(8, "Give it a short title (at least 8 characters).").max(120, "Keep the title under 120 characters."),
  description: z.string().trim().min(20, "Say what happened in a sentence or two (at least 20 characters).").max(2000, "Keep it under 2,000 characters."),
  districtId: z.string().min(1, "Choose the district."),
  locationText: optionalText(120),
  placeId: optionalText(60),
  geo: pickedGeoSchema.optional(),
  /** yyyy-mm-dd */
  incidentDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a date.")
    .refine((v) => v === undefined || new Date(`${v}T00:00:00Z`).getTime() <= Date.now() + 86_400_000, "The date cannot be in the future.")
    .refine((v) => v === undefined || new Date(`${v}T00:00:00Z`).getTime() >= Date.now() - 3 * 365 * 86_400_000, "That is more than three years ago."),
  reportedUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined))
    .refine((v) => v === undefined || /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(v), "Enter a web address, for example example.com/page."),
  amountInr: z.number().int("Whole rupees only.").min(1, "Enter an amount above zero.").max(10_000_000, "That amount looks too large.").optional(),
  evidenceIds: z.array(z.string()).max(8, "Attach at most 8 files.").default([]),
  isAnonymous: z.boolean().default(true),
  investigationId: optionalText(60),
});
export type ReportInput = z.input<typeof reportInputSchema>;
export type ReportData = z.output<typeof reportInputSchema>;

// ───────────────────────── The list ─────────────────────────

export const REPORT_TABS = [
  { value: "all", label: "All" },
  { value: "following", label: "Following" },
  { value: "mine", label: "Mine" },
  { value: "verified", label: "Verified" },
] as const;
export type ReportTab = (typeof REPORT_TABS)[number]["value"];
export const REPORT_PAGE_SIZE = 12;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Everything the list page reads from the URL. Unknown values fall back to defaults. */
export const reportListParamsSchema = z.object({
  tab: z.preprocess(first, z.enum(REPORT_TABS.map((t) => t.value) as [ReportTab, ...ReportTab[]]).catch("all")),
  q: z.preprocess(first, z.string().trim().max(60).catch("")).transform((v) => v || undefined),
  category: z.preprocess(first, z.enum(REPORT_CATEGORIES).optional().catch(undefined)),
  district: z.preprocess(first, z.string().trim().max(40).regex(/^[a-z0-9]+$/i).optional().catch(undefined)),
  status: z.preprocess(first, z.enum(REPORT_STATUSES).optional().catch(undefined)),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(500).catch(1)),
});
export type ReportListParams = z.output<typeof reportListParamsSchema>;

export function reportsHref(p: Partial<ReportListParams>) {
  const sp = new URLSearchParams();
  if (p.tab && p.tab !== "all") sp.set("tab", p.tab);
  if (p.q) sp.set("q", p.q);
  if (p.category) sp.set("category", p.category);
  if (p.district) sp.set("district", p.district);
  if (p.status) sp.set("status", p.status);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const s = sp.toString();
  return s ? `/reports?${s}` : "/reports";
}
