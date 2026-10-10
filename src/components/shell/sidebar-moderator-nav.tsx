import { hasRole } from "@/server/roles";
import { ModeratorNav } from "./app-sidebar";

/** Async server part of the sidebar; render it inside <Suspense fallback={null}>. */
export async function SidebarModeratorNav({ counts }: { counts: Record<string, number> }) {
  if (!(await hasRole("MODERATOR"))) return null;
  return <ModeratorNav counts={counts} />;
}
