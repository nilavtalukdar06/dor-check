import { ModeratorOnly } from "@/components/shell/moderator-only";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Knowledge base" };

export default function KnowledgePage() {
  return (
    <ModeratorOnly loadingLabel="Checking your access…">
      <PageHeader title="Knowledge base" description="Sources the agent searches, with sync status." />
    </ModeratorOnly>
  );
}
