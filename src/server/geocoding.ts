import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { nameScore } from "@/lib/price";
import { normalizeText } from "@/lib/route-key";
import prisma from "@/lib/prisma";
import { haversineKm } from "./routing";

/** North-east India: bias and bound every search here. */
const NE_BBOX = "88.0,21.5,97.5,29.6";
const NE_PROXIMITY = "92.5,26.0";
const NEAREST_DISTRICT_KM = 60;

export type PlaceSuggestion = {
  /** Stable key for the list. */
  key: string;
  name: string;
  /** Second line: district or full address. */
  detail: string;
  source: "seed" | "mapbox";
  placeId?: string;
  mapboxId?: string;
  lat: number;
  lng: number;
  kind: string;
};

export type ResolvedPlace = {
  id: string;
  name: string;
  fullName: string | null;
  lat: number;
  lng: number;
  districtId: string | null;
  districtName: string | null;
  aliases: string[];
};

type MapboxFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    mapbox_id: string;
    name: string;
    full_address?: string;
    place_formatted?: string;
    feature_type: string;
  };
};

const KIND: Record<string, string> = {
  place: "CITY",
  locality: "LOCALITY",
  neighborhood: "LOCALITY",
  district: "DISTRICT",
  poi: "POI",
  street: "STREET",
  address: "ADDRESS",
};

/** Towns and localities first; streets and shops only when nothing better exists. */
const RANK: Record<string, number> = { place: 0, locality: 1, neighborhood: 2, district: 3, poi: 4, street: 5, address: 6 };

/** Seeded places and districts barely change; keep them in memory for a few minutes. */
const CACHE_MS = 5 * 60_000;
let seededCache: { at: number; rows: Awaited<ReturnType<typeof loadSeeded>> } | null = null;
let districtCache: { at: number; rows: { id: string; name: string; lat: number; lng: number }[] } | null = null;

function loadSeeded() {
  return prisma.place.findMany({
    where: { source: "seed" },
    include: { district: { select: { name: true } } },
  });
}

async function seededPlaces() {
  if (!seededCache || Date.now() - seededCache.at > CACHE_MS) seededCache = { at: Date.now(), rows: await loadSeeded() };
  return seededCache.rows;
}

async function allDistricts() {
  if (!districtCache || Date.now() - districtCache.at > CACHE_MS) {
    districtCache = { at: Date.now(), rows: await prisma.district.findMany({ select: { id: true, name: true, lat: true, lng: true } }) };
  }
  return districtCache.rows;
}

async function mapboxGet(url: string): Promise<MapboxFeature[]> {
  const token = env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(`${url}&access_token=${token}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: MapboxFeature[] };
    return json.features ?? [];
  } catch {
    return [];
  }
}

/** Geocoding (towns, localities, streets) plus Search Box (airports, stations, sights). */
export async function searchMapbox(q: string, limit = 5): Promise<PlaceSuggestion[]> {
  const query = encodeURIComponent(q.trim());
  if (!query) return [];
  const common = `country=in&bbox=${NE_BBOX}&proximity=${NE_PROXIMITY}&limit=${limit}`;
  const [geo, poi] = await Promise.all([
    mapboxGet(`https://api.mapbox.com/search/geocode/v6/forward?q=${query}&autocomplete=true&${common}`),
    mapboxGet(`https://api.mapbox.com/search/searchbox/v1/forward?q=${query}&${common}`),
  ]);
  const seen = new Set<string>();
  return [...geo, ...poi]
    .filter((f) => {
      if (seen.has(f.properties.mapbox_id)) return false;
      seen.add(f.properties.mapbox_id);
      return true;
    })
    .sort((a, b) => (RANK[a.properties.feature_type] ?? 9) - (RANK[b.properties.feature_type] ?? 9))
    .slice(0, limit)
    .map((f) => ({
      key: `mapbox:${f.properties.mapbox_id}`,
      name: f.properties.name,
      detail: f.properties.full_address ?? f.properties.place_formatted ?? "",
      source: "mapbox",
      mapboxId: f.properties.mapbox_id,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      kind: KIND[f.properties.feature_type] ?? "PLACE",
    }));
}

/** Seeded places matching the text, best first. */
export async function searchSeeded(q: string, limit = 5): Promise<PlaceSuggestion[]> {
  const places = await seededPlaces();
  const nq = normalizeText(q);
  return places
    .map((p) => ({
      p,
      score: nq
        ? Math.max(
            nameScore(q, [p.name, ...p.aliases]),
            [p.name, ...p.aliases].some((n) => normalizeText(n).includes(nq)) ? 0.4 : 0,
          )
        : 0.1,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map(({ p }) => ({
      key: `seed:${p.id}`,
      name: p.name,
      detail: p.district?.name ?? "",
      source: "seed" as const,
      placeId: p.id,
      lat: p.lat,
      lng: p.lng,
      kind: p.kind,
    }));
}

async function nearestDistrict(lat: number, lng: number) {
  const districts = await allDistricts();
  let best: { id: string; name: string; km: number } | null = null;
  for (const d of districts) {
    const km = haversineKm({ lat, lng }, { lat: d.lat, lng: d.lng });
    if (!best || km < best.km) best = { id: d.id, name: d.name, km };
  }
  return best && best.km <= NEAREST_DISTRICT_KM ? best : null;
}

/** Save a Mapbox result as a Place so later checks and saved research can point at it. */
async function upsertMapboxPlace(s: PlaceSuggestion): Promise<ResolvedPlace> {
  const existing = await prisma.place.findUnique({
    where: { mapboxId: s.mapboxId! },
    include: { district: { select: { name: true } } },
  });
  if (existing) {
    return { ...existing, districtName: existing.district?.name ?? null };
  }
  const district = await nearestDistrict(s.lat, s.lng);
  const hash = createHash("sha1").update(s.mapboxId!).digest("hex").slice(0, 6);
  const place = await prisma.place.upsert({
    where: { mapboxId: s.mapboxId! },
    update: {},
    create: {
      slug: `mbx-${normalizeText(s.name).slice(0, 50)}-${hash}`,
      name: s.name,
      fullName: s.detail ? `${s.name}, ${s.detail}` : s.name,
      kind: s.kind,
      lat: s.lat,
      lng: s.lng,
      aliases: [],
      districtId: district?.id ?? null,
      mapboxId: s.mapboxId,
      source: "mapbox",
    },
  });
  return { ...place, districtName: district?.name ?? null };
}

/** Coordinates the client picked from a Mapbox suggestion; only trusted inside the bounding box. */
export type PickedGeo = { mapboxId: string; name: string; detail?: string; lat: number; lng: number; kind?: string };

const [W, S, E, N] = NE_BBOX.split(",").map(Number);
const insideBox = (lat: number, lng: number) => lat >= S && lat <= N && lng >= W && lng <= E;

/**
 * Turn what the user typed or picked into a place with coordinates:
 * a picked seeded place, a picked Mapbox result, a seeded place matching the text,
 * or the best Mapbox result for the text. Null when nothing is found.
 */
export async function resolvePlace(
  text: string | undefined,
  pickedPlaceId?: string,
  pickedGeo?: PickedGeo,
): Promise<ResolvedPlace | null> {
  if (!text?.trim()) return null;

  if (pickedPlaceId) {
    const p = await prisma.place.findUnique({ where: { id: pickedPlaceId }, include: { district: { select: { name: true } } } });
    if (p && normalizeText(p.name) === normalizeText(text)) return { ...p, districtName: p.district?.name ?? null };
  }
  if (pickedGeo && normalizeText(pickedGeo.name) === normalizeText(text) && insideBox(pickedGeo.lat, pickedGeo.lng)) {
    return upsertMapboxPlace({
      key: pickedGeo.mapboxId,
      name: pickedGeo.name,
      detail: pickedGeo.detail ?? "",
      source: "mapbox",
      mapboxId: pickedGeo.mapboxId,
      lat: pickedGeo.lat,
      lng: pickedGeo.lng,
      kind: pickedGeo.kind ?? "PLACE",
    });
  }

  // Typed text: a clear seeded match wins, otherwise ask Mapbox.
  const seeded = await seededPlaces();
  const scored = seeded
    .map((p) => ({ p, score: nameScore(text, [p.name, ...p.aliases]) }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  if (scored[0] && !(scored[1] && scored[1].score === scored[0].score)) {
    return { ...scored[0].p, districtName: scored[0].p.district?.name ?? null };
  }

  const hit = (await searchMapbox(text, 3))[0];
  return hit ? upsertMapboxPlace(hit) : null;
}
