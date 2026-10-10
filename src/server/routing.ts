import { env } from "@/lib/env";

export type LatLng = { lat: number; lng: number };

export type Route = {
  distanceKm: number;
  durationMin: number;
  /** [lat, lng] points along the road; null when only a straight line is known. */
  geometry: [number, number][] | null;
  /** True when the distance is a straight-line estimate, not a routed one. */
  approx: boolean;
  via: null;
};

export function haversineKm(a: LatLng, b: LatLng) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Keep at most `max` points so the stored geometry stays small. */
function thin(points: [number, number][], max = 250): [number, number][] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Straight-line estimate: road factor 1.3, 40 km/h average in the hills. Labelled "approx". */
function estimate(a: LatLng, b: LatLng): Route {
  const km = haversineKm(a, b) * 1.3;
  return {
    distanceKm: Math.round(km),
    durationMin: Math.round((km / 40) * 60),
    geometry: null,
    approx: true,
    via: null,
  };
}

/** Road route from OpenRouteService; falls back to an approximate straight-line estimate. */
export async function getRoute(from: LatLng, to: LatLng): Promise<Route> {
  const key = env.ORS_API_KEY;
  if (!key) return estimate(from, to);
  try {
    const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return estimate(from, to);
    const json = (await res.json()) as {
      features?: {
        properties?: { summary?: { distance: number; duration: number } };
        geometry?: { coordinates: [number, number][] };
      }[];
    };
    const feature = json.features?.[0];
    const summary = feature?.properties?.summary;
    const coords = feature?.geometry?.coordinates;
    if (!summary || !coords?.length) return estimate(from, to);
    return {
      distanceKm: Math.round(summary.distance / 1000),
      durationMin: Math.round(summary.duration / 60),
      geometry: thin(coords.map(([lng, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5])),
      approx: false,
      via: null,
    };
  } catch {
    return estimate(from, to);
  }
}
