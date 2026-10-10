import { z } from "zod";

/** URL tab values and the service types they stand for. */
export const DIRECTORY_TABS = [
  { value: "all", label: "All", type: undefined },
  { value: "stays", label: "Stays", type: "STAY" },
  { value: "taxis", label: "Taxis", type: "TAXI" },
  { value: "guides", label: "Guides", type: "GUIDE" },
  { value: "tours", label: "Tours", type: "TOUR" },
] as const;

export type DirectoryTab = (typeof DIRECTORY_TABS)[number]["value"];

export const TYPE_LABEL: Record<string, string> = {
  STAY: "Stay",
  TAXI: "Taxi",
  GUIDE: "Guide",
  TOUR: "Tour",
  OTHER: "Other",
};

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Everything the directory page reads from the URL. Unknown values fall back to defaults. */
export const directoryParamsSchema = z.object({
  type: z.preprocess(first, z.enum(DIRECTORY_TABS.map((t) => t.value) as [DirectoryTab, ...DirectoryTab[]]).catch("all")),
  q: z.preprocess(first, z.string().trim().max(60).catch("")).transform((v) => v || undefined),
  verified: z.preprocess(first, z.enum(["1"]).optional().catch(undefined)),
  property: z.preprocess(first, z.string().trim().max(120).optional().catch(undefined)),
});
export type DirectoryParams = z.output<typeof directoryParamsSchema>;

export const serviceTypeFor = (tab: DirectoryTab) => DIRECTORY_TABS.find((t) => t.value === tab)?.type;

/** Build a directory URL from params, leaving out defaults so URLs stay short. */
export function directoryHref(p: Partial<DirectoryParams>) {
  const sp = new URLSearchParams();
  if (p.type && p.type !== "all") sp.set("type", p.type);
  if (p.q) sp.set("q", p.q);
  if (p.verified) sp.set("verified", "1");
  if (p.property) sp.set("property", p.property);
  const s = sp.toString();
  return s ? `/directory?${s}` : "/directory";
}
