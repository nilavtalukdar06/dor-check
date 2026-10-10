import { Suspense } from "react";
import { ReportForm } from "@/components/reports/report-form";
import { LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getPriceFormOptions } from "@/server/price-options";
import { getReportFormOptions } from "@/server/reports-view";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "New report" };

async function Form({ searchParams }: Pick<PageProps<"/reports/new">, "searchParams">) {
  const { investigation } = await searchParams;
  const user = await getCurrentUser();
  const [options, price] = await Promise.all([
    getReportFormOptions(user?.id ?? "", typeof investigation === "string" ? investigation.slice(0, 40) : undefined),
    getPriceFormOptions(),
  ]);
  // Keyed by the investigation so opening another one refills the form.
  return <ReportForm key={options.prefill?.investigationId ?? "new"} options={options} popularPlaces={price.popularPlaces} />;
}

export default function NewReportPage({ searchParams }: Pick<PageProps<"/reports/new">, "searchParams">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New report" description="Describe what happened. Reports are shown as unverified until a moderator reviews them." />
      <Suspense
        fallback={
          <>
            <LoadingState text="Loading the form…" />
            <div className="grid gap-6 lg:grid-cols-[3fr_2fr]"><Skeleton className="h-[40rem] rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>
          </>
        }
      >
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
