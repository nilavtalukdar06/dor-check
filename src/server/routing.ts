import { env } from "@/lib/env";

export type LatLng = { lat: number; lng: number };

export type Route = {
  distanceKm: number;
  durationMin: number;
  /** [lat, lng] points along the road; null when only a straight line is known. */
  geometry: [number, number][] | null;
  /** True when the distance is a straight-line estimate, not a routed one. */
  approx: boolean;
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
export function thin(points: [number, number][], max = 250): [number, number][] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Straight-line estimate: road factor 1.3, 40 km/h average in the hills. Labelled "approx". */
export function estimateRoute(a: LatLng, b: LatLng): Route {
  const km = haversineKm(a, b) * 1.3;
  return { distanceKm: Math.round(km), durationMin: Math.round((km / 40) * 60), geometry: null, approx: true };
}

type DirectionsResponse = {
  routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[];
};

/** Parse a Mapbox Directions response; null when it has no usable route. */
export function parseDirections(json: DirectionsResponse): Route | null {
  const r = json.routes?.[0];
  if (!r || !r.geometry?.coordinates?.length) return null;
  return {
    distanceKm: Math.round(r.distance / 1000),
    durationMin: Math.round(r.duration / 60),
    geometry: thin(
      r.geometry.coordinates.map(([lng, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]),
    ),
    approx: false,
  };
}

/** Road route from Mapbox Directions (with live traffic); falls back to a straight-line estimate. */
export async function getRoute(from: LatLng, to: LatLng): Promise<Route> {
  const token = env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return estimateRoute(from, to);
  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=simplified&access_token=${token}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return estimateRoute(from, to);
    return parseDirections((await res.json()) as DirectionsResponse) ?? estimateRoute(from, to);
  } catch {
    return estimateRoute(from, to);
  }
}
