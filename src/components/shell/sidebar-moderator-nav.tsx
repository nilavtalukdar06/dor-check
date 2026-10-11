import prisma from "@/lib/prisma";
import { hasRole } from "@/server/roles";
import { ModeratorNav } from "./app-sidebar";

/** Async server part of the sidebar; render it inside <Suspense fallback={null}>. */
export async function SidebarModeratorNav({ counts }: { counts: Record<string, number> }) {
  if (!(await hasRole("MODERATOR"))) return null;
  // What is waiting for a moderator: new reports, flagged comments and listing requests.
  const [reports, comments, listings] = await Promise.all([
    prisma.report.count({ where: { deletedAt: null, status: "NEW" } }),
    prisma.comment.count({ where: { status: "FLAGGED", report: { deletedAt: null } } }),
    prisma.property.count({ where: { listingStatus: "PENDING" } }),
  ]);
  return <ModeratorNav counts={{ ...counts, moderation: reports + comments + listings }} />;
}
