import { getCurrentUser } from "@/server/users";
import { UserMenu } from "./user-menu";

/** Async server part of the sidebar; render it inside <Suspense>. */
export async function SidebarUser() {
  const user = await getCurrentUser();
  return (
    <UserMenu
      name={user?.displayName ?? user?.name ?? "Traveller"}
      imageUrl={user?.imageUrl ?? undefined}
    />
  );
}

export function SidebarUserFallback() {
  return (
    <div className="h-10 w-full rounded-lg border bg-background shadow-xs" />
  );
}
