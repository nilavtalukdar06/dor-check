"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";

/** Mapbox needs the browser (WebGL), so it loads on the client only. */
export const MapboxMapLazy = dynamic(() => import("./mapbox-map"), {
  ssr: false,
  loading: () => (
    <div className="relative size-full">
      <Skeleton className="size-full rounded-none" />
      <LoadingState text="Loading the map…" className="absolute inset-0 justify-center" />
    </div>
  ),
});
