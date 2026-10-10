import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { RunScreen } from "@/components/investigate/run-screen";
import { LoadingState } from "@/components/shell/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { getInvestigationView } from "@/server/investigation-view";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Investigation" };

async function Run({ params }: Pick<PageProps<"/investigate/[id]">, "params">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const view = await getInvestigationView(user.id, id);
  if (!view) notFound();
  // A finished check goes straight to its verdict.
  if (view.status === "COMPLETED") redirect(`/investigate/${id}/verdict`);
  return <RunScreen view={view} />;
}

function RunFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-64" />
      </div>
      <LoadingState text="Loading the investigation…" />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-96 rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function InvestigationPage({ params }: Pick<PageProps<"/investigate/[id]">, "params">) {
  return (
    <Suspense fallback={<RunFallback />}>
      <Run params={params} />
    </Suspense>
  );
}
