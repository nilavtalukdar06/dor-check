import { Suspense } from "react";
import { formValuesFrom, type PriceFormValues } from "@/components/price/form-values";
import { PriceCheckClient } from "@/components/price/price-check-client";
import { PriceResultPanel } from "@/components/price/price-result";
import { ResearchProgress } from "@/components/price/research-progress";
import { EmptyResult } from "@/components/price/result-placeholders";
import { CardSkeleton, LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { rs } from "@/lib/format";
import { PRICE_SERVICES } from "@/lib/price-schema";
import { getPricePage } from "@/server/price-check";
import { getPriceFormOptions } from "@/server/price-options";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Price check" };

// Web research can take up to about 45 seconds after the response is sent.
export const maxDuration = 60;

async function PriceCheckLoader({ searchParams }: Pick<PageProps<"/price">, "searchParams">) {
  const { check, service, place } = await searchParams;
  const id = typeof check === "string" ? check : null;
  // Links from elsewhere (the directory) can start a check: /price?service=STAY&place=Majuli
  const startService = PRICE_SERVICES.find((s) => s === service);
  const startPlace = typeof place === "string" ? place.slice(0, 120) : "";
  const prefill: Partial<PriceFormValues> | undefined =
    !id && startService
      ? { service: startService, ...(startService === "TAXI" ? { origin: startPlace } : { location: startPlace }) }
      : undefined;

  const [options, user] = await Promise.all([getPriceFormOptions(), getCurrentUser()]);
  const page = id && user ? await getPricePage(user.id, id) : null;
  const quoted = page?.input ? rs(page.input.quotedInr) : "";

  return (
    // Keyed by the check and its status so the form refills when another check opens.
    <PriceCheckClient
      key={page ? `${page.id}:${page.status}` : `new:${startService ?? ""}:${startPlace}`}
      options={options}
      defaults={page ? formValuesFrom(page.input, quoted) : prefill}
      currentId={page?.id ?? null}
    >
      {!page ? (
        <EmptyResult notFound={!!id} />
      ) : page.status === "completed" ? (
        <PriceResultPanel view={page.view} />
      ) : (
        <ResearchProgress
          id={page.id}
          title={page.title}
          steps={page.steps}
          failed={page.status === "failed"}
        />
      )}
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
        description="Compare a quote for any taxi route, stay, guide or tour with known tariffs and published prices."
      />
      <Suspense fallback={<PriceFallback />}>
        <PriceCheckLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
