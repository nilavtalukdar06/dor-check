import { Suspense } from "react";
import { requireRole } from "@/server/roles";
import { PageSkeleton } from "./loading";

async function Gate({ children }: { children: React.ReactNode }) {
  await requireRole("MODERATOR");
  return children;
}

/** Wrap a moderator page's content. Non-moderators get the 403 page. */
export function ModeratorOnly({
  children,
  loadingLabel,
}: {
  children: React.ReactNode;
  loadingLabel: string;
}) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" label={loadingLabel} />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
