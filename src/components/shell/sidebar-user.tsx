import { Skeleton } from "@/components/ui/skeleton";
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
    <div
      role="status"
      aria-label="Loading your account"
      className="flex h-10 w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 shadow-xs"
    >
      <Skeleton className="size-6 rounded-full" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  );
}
