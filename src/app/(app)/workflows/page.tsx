import { ModeratorOnly } from "@/components/shell/moderator-only";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Workflow runs" };

export default function WorkflowsPage() {
  return (
    <ModeratorOnly loadingLabel="Checking your access…">
      <PageHeader title="Workflow runs" description="Background jobs and their recent runs." />
    </ModeratorOnly>
  );
}
