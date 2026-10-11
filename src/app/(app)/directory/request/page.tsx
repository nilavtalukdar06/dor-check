import { Suspense } from "react";
import { ListingRequestForm } from "@/components/directory/listing-request-form";
import { LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import prisma from "@/lib/prisma";
import { getPriceFormOptions } from "@/server/price-options";

export const metadata = { title: "Request a listing" };

async function Form() {
  const [districts, options] = await Promise.all([prisma.district.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }), getPriceFormOptions()]);
  return <ListingRequestForm districts={districts} popular={options.popularPlaces} />;
}

export default function RequestListingPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Request a listing" description="Run a stay, taxi service, guide service or tour in Assam or Meghalaya? Ask for it to be listed. A moderator checks it before it appears." />
      <Suspense fallback={<div className="flex flex-col gap-4"><LoadingState text="Loading the form…" /><Skeleton className="h-96 rounded-xl" /></div>}>
        <Form />
      </Suspense>
    </div>
  );
}
