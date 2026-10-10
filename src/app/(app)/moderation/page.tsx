import { ModeratorOnly } from "@/components/shell/moderator-only";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Moderation queue" };

export default function ModerationPage() {
  return (
    <ModeratorOnly loadingLabel="Checking your access…">
      <PageHeader title="Moderation queue" description="Review reports, publish official findings and manage the directory." />
    </ModeratorOnly>
  );
}
