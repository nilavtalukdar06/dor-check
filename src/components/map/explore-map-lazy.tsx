"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";

/** Mapbox needs WebGL, so the Explore map loads in the browser only. */
export const ExploreMapLazy = dynamic(() => import("./explore-map"), {
  ssr: false,
  loading: () => (
    <div className="relative size-full">
      <Skeleton className="size-full rounded-none" />
      <LoadingState text="Loading the map…" className="absolute inset-0 justify-center" />
    </div>
  ),
});

export type { ExploreMapHandle, MapView } from "./explore-map";
