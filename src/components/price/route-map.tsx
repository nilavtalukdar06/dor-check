"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";

type Point = { lat: number; lng: number };

/** CSS pin: no image files, so nothing breaks in the bundler. */
const pin = (color: string) =>
  L.divIcon({
    className: "",
    iconSize: [26, 34],
    iconAnchor: [13, 32],
    html: `<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
  });

const startIcon = pin("#16a34a");
const endIcon = pin("#dc2626");

export default function RouteMap({
  from,
  to,
  geometry,
}: {
  from: Point;
  to: Point;
  geometry: [number, number][] | null;
}) {
  const line: [number, number][] = geometry ?? [
    [from.lat, from.lng],
    [to.lat, to.lng],
  ];
  const bounds = L.latLngBounds(line).pad(0.15);

  return (
    <MapContainer
      bounds={bounds}
      scrollWheelZoom={false}
      className="h-full w-full"
      attributionControl
      aria-label="Route map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline
        positions={line}
        pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.9, dashArray: geometry ? undefined : "8 8" }}
      />
      <Marker position={[from.lat, from.lng]} icon={startIcon} />
      <Marker position={[to.lat, to.lng]} icon={endIcon} />
    </MapContainer>
  );
}
