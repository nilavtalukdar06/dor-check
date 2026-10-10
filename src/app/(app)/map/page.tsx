import { MapExplorer } from "@/components/map/map-explorer";
import prisma from "@/lib/prisma";

export const metadata = { title: "Explore map" };

async function demoNote() {
  const setting = await prisma.appSetting.findUnique({ where: { key: "demo_banner" } });
  const value = setting?.value as { enabled?: boolean } | null;
  return value?.enabled ? "Locations are illustrative." : null;
}

export default async function ExploreMapPage() {
  const note = await demoNote();
  return (
    // Break out of the page padding so the map fills the area under the top bar.
    <div className="-mx-4 -mt-6 -mb-24 h-[calc(100svh-3.5rem)] md:-mx-8 md:-mt-8 md:-mb-8">
      <MapExplorer demoNote={note} />
    </div>
  );
}
