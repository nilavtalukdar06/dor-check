import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DirectoryControls } from "@/components/directory/directory-controls";
import { PropertyCard } from "@/components/directory/property-card";
import { PropertyDetailView } from "@/components/directory/property-detail";
import { PropertyDrawer } from "@/components/directory/property-drawer";
import { GridSkeleton, LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { directoryHref, directoryParamsSchema } from "@/lib/directory";
import { getPropertyDetail, listProperties } from "@/server/directory-queries";

export const metadata = { title: "Explore directory" };

async function DirectoryResults({ searchParams }: Pick<PageProps<"/directory">, "searchParams">) {
  const params = directoryParamsSchema.parse(await searchParams);
  const filters = { type: params.type, q: params.q, verified: params.verified };

  // The list and the open drawer load in parallel.
  const [{ items, total, pageSize }, detail] = await Promise.all([
    listProperties(filters),
    params.property ? getPropertyDetail(params.property) : Promise.resolve(null),
  ]);

  const priceHref = detail
    ? `/price?${new URLSearchParams({ service: detail.type === "TAXI" ? "TAXI" : detail.type === "STAY" || detail.type === "GUIDE" || detail.type === "TOUR" ? detail.type : "STAY", place: detail.districtName }).toString()}`
    : "/price";

  return (
    <>
      <DirectoryControls params={filters} />
      <p className="sr-only" aria-live="polite">
        {total} {total === 1 ? "place" : "places"} found
      </p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-full border bg-soft">
            <SearchXIcon className="size-4 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">No places match</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {params.q ? `Nothing in the directory matches "${params.q}"` : "Nothing matches these filters"}
            {params.verified ? " among verified places" : ""}. A place missing from the directory is not a warning sign by itself, but check it before you pay.
          </p>
          <Link href="/directory" className="text-sm font-medium underline underline-offset-2">
            Clear filters
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <PropertyCard item={item} href={directoryHref({ ...filters, property: item.slug })} />
            </li>
          ))}
        </ul>
      )}
      {total > pageSize ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the first {pageSize} of {total}. Narrow the search to see the rest.
        </p>
      ) : null}

      {detail ? (
        <PropertyDrawer key={detail.slug} name={detail.name} params={filters}>
          <PropertyDetailView p={detail} priceHref={priceHref} />
        </PropertyDrawer>
      ) : null}
    </>
  );
}

function ResultsFallback() {
  return (
    <>
      <div className="flex items-end justify-between gap-4 border-b pb-3">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-9 w-64" />
      </div>
      <LoadingState text="Loading the directory…" />
      <GridSkeleton items={9} />
    </>
  );
}

export default function DirectoryPage({ searchParams }: PageProps<"/directory">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Explore directory" description="Registered stays, taxi unions, guides and tours from the demo tourism directory." />
      <Suspense fallback={<ResultsFallback />}>
        <DirectoryResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
