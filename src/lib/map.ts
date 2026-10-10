import { z } from "zod";

export const MAP_LAYERS = ["reports", "properties", "tariffs"] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

/** Pin kinds and their colours: red scam report, amber fare dispute, green verified, grey listed, blue tariff board. */
export type SignalKind = "scam" | "fare" | "verified" | "listed" | "board";

export const KIND_COLOR: Record<SignalKind, string> = {
  scam: "#dc2626",
  fare: "#f59e0b",
  verified: "#16a34a",
  listed: "#6b7280",
  board: "#2563eb",
};

export const LAYER_LABEL: Record<MapLayer, string> = {
  reports: "Reports",
  properties: "Properties",
  tariffs: "Tariffs",
};

/** One pin and one row in the side list. */
export type MapSignal = {
  id: string;
  layer: MapLayer;
  kind: SignalKind;
  title: string;
  /** "Shillong · 8 Oct" */
  subtitle: string;
  badge: "Report" | "Directory" | "Tariff";
  lat: number;
  lng: number;
  href: string;
};

export type Bbox = [west: number, south: number, east: number, north: number];

/** North-east India, the default view. */
export const NE_BOUNDS: Bbox = [89.6, 24.0, 96.2, 28.3];

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);

export const mapQuerySchema = z.object({
  bbox: z
    .string()
    .optional()
    .transform((v, ctx): Bbox | undefined => {
      if (!v) return undefined;
      const parts = v.split(",").map(Number);
      const ok =
        parts.length === 4 &&
        parts.every(Number.isFinite) &&
        parts[0] >= -180 && parts[2] <= 180 && parts[1] >= -90 && parts[3] <= 90 &&
        parts[0] < parts[2] && parts[1] < parts[3];
      if (!ok) {
        ctx.addIssue({ code: "custom", message: "bbox must be west,south,east,north" });
        return z.NEVER;
      }
      return parts as Bbox;
    }),
  layers: z
    .string()
    .optional()
    .transform((v) => {
      const picked = (v ?? "").split(",").filter((l): l is MapLayer => (MAP_LAYERS as readonly string[]).includes(l));
      return picked.length ? picked : [...MAP_LAYERS];
    }),
  state: z.enum(["AS", "ML"]).optional(),
  days: num(1, 365).optional(),
  q: z.string().trim().max(60).optional(),
});
export type MapQuery = z.output<typeof mapQuerySchema>;

const rad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Nearest to `center` first. Does not change the input array. */
export function sortByDistance<T extends { lat: number; lng: number }>(items: T[], center: { lat: number; lng: number }) {
  return items
    .map((item) => ({ item, d: distanceKm(center, item) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.item);
}

/** "8 Oct" in India time. */
export function shortDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
