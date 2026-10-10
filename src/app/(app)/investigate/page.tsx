import { Suspense } from "react";
import { InvestigateScreen } from "@/components/investigate/investigate-form";
import { LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import prisma from "@/lib/prisma";
import { getRole } from "@/server/roles";
import { getUsage } from "@/server/usage";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "New investigation" };

async function FormLoader({ searchParams }: Pick<PageProps<"/investigate">, "searchParams">) {
  const { url } = await searchParams;
  const user = await getCurrentUser();
  const [districts, usage] = await Promise.all([
    prisma.district.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    user ? getUsage(user.id, (await getRole()) ?? "TRAVELLER") : Promise.resolve({ used: 0, limit: null, remaining: null, planName: "Free" }),
  ]);
  // Links from elsewhere can prefill the address: /investigate?url=https://...
  const initialUrl = typeof url === "string" && /^https?:\/\//i.test(url) ? url.slice(0, 500) : undefined;
  return <InvestigateScreen districts={districts} usage={usage} initialUrl={initialUrl} />;
}

function FormFallback() {
  return (
    <>
      <LoadingState text="Loading the form…" />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-[34rem] rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    </>
  );
}

export default function InvestigatePage({ searchParams }: Pick<PageProps<"/investigate">, "searchParams">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New investigation" description="Paste a link, a business name or a message. The agent researches sources and shows its evidence." />
      <Suspense fallback={<FormFallback />}>
        <FormLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
