import { MapExplorer } from "@/components/map/map-explorer";

export const metadata = { title: "Explore map" };

export default function ExploreMapPage() {
  return (
    // Break out of the page padding so the map fills the area under the top bar.
    <div className="-mx-4 -mt-6 -mb-24 h-[calc(100svh-3.5rem)] md:-mx-8 md:-mt-8 md:-mb-8">
      <MapExplorer />
    </div>
  );
}
