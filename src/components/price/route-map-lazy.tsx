"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";

/** Leaflet touches `window`, so it loads in the browser only. */
const RouteMap = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => (
    <div className="relative size-full">
      <Skeleton className="size-full rounded-none" />
      <LoadingState text="Loading the route map…" className="absolute inset-0 justify-center" />
    </div>
  ),
});

export { RouteMap as RouteMapLazy };
