import { Suspense } from "react";
import { rs } from "@/lib/format";
import { PriceCheckClient, type PriceFormValues } from "@/components/price/price-check-client";
import { PriceResultPanel } from "@/components/price/price-result";
import { EmptyResult } from "@/components/price/result-placeholders";
import { CardSkeleton, LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { getPriceFormOptions } from "@/server/price-options";
import { getPriceCheck, type PriceCheckView } from "@/server/price-check";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Price check" };

function formDefaults(view: PriceCheckView): Partial<PriceFormValues> {
  return {
    service: view.service,
    origin: view.origin.name,
    destination: view.destination?.name ?? "",
    vehicle: view.vehicle ?? "SEDAN",
    districtId: view.districtId ?? "",
    qualifier: view.qualifier ?? "",
    quoted: rs(view.quotedInr),
  };
}

async function PriceCheckLoader({ searchParams }: Pick<PageProps<"/price">, "searchParams">) {
  const { check } = await searchParams;
  const id = typeof check === "string" ? check : null;

  const [options, user] = await Promise.all([getPriceFormOptions(), getCurrentUser()]);
  const view = id && user ? await getPriceCheck(user.id, id) : null;

  return (
    // Keyed by the saved check so the form re-initialises when another one is opened.
    <PriceCheckClient
      key={view?.id ?? "new"}
      options={options}
      defaults={view ? formDefaults(view) : undefined}
      currentId={view?.id ?? null}
    >
      {view ? <PriceResultPanel view={view} /> : <EmptyResult notFound={!!id} />}
    </PriceCheckClient>
  );
}

function PriceFallback() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingState text="Loading the price check…" />
      <div className="grid gap-4 lg:grid-cols-[5fr_7fr]">
        <CardSkeleton lines={7} />
        <CardSkeleton lines={4} />
      </div>
    </div>
  );
}

export default function PricePage({ searchParams }: PageProps<"/price">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Price check"
        description="Compare a quote with the demo benchmark range for the same route or service."
      />
      <Suspense fallback={<PriceFallback />}>
        <PriceCheckLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
