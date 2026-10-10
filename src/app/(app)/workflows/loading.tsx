import { PageSkeleton } from "@/components/shell/loading";

export default function Loading() {
  return <PageSkeleton variant="table" label="Loading workflow runs…" />;
}
